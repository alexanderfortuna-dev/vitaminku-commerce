-- 0014: pesanan atomik + idempoten (create_order), akses anon ke pesanan ditutup, cek token pesanan hanya lewat server,
-- kebijakan eksplisit chat_rate_hits, urutan katalog "punya foto dulu". Aditif & idempoten.

-- 1. Kunci idempotensi: kirim ulang dengan kunci sama = pesanan yang sama.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_idempotency_key_len') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_idempotency_key_len
      CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 16 AND 100);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uq ON public.orders (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. Tidak ada tulis/baca langsung dari browser (anon). Penulisan hanya lewat RPC di bawah (service_role).
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;

-- 3. Bentuk jawaban pesanan (internal; tidak bisa dipanggil dari API).
CREATE OR REPLACE FUNCTION public.order_result_json(_id uuid, _duplicate boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'order_id', o.id, 'order_number', o.order_number, 'access_token', o.access_token, 'status', o.status,
    'duplicate', _duplicate, 'branch_id', o.branch_id, 'branch_name', o.branch_name, 'branch_whatsapp', o.branch_whatsapp,
    'subtotal', o.subtotal, 'discount_total', o.discount_total, 'shipping_cost', o.shipping_cost, 'total', o.total,
    'payment_url', o.payment_url,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', i.slug, 'sku', i.sku, 'name', i.name,
        'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.name)
        FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
  FROM public.orders o WHERE o.id = _id
$$;
REVOKE ALL ON FUNCTION public.order_result_json(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_result_json(uuid, boolean) TO service_role;

-- 4. create_order: validasi produk (aktif, tidak diblokir, berharga, stok cukup), harga SELALU dari tabel products
--    (field harga dari klien diabaikan), cabang harus aktif, satu transaksi, idempoten.
--    payload: {lines:[{slug,quantity}], customer:{name,whatsapp,address,note}, branch_id?, branch_whatsapp?,
--              payment_mode?, shipping?:{mode,company,service,label,cost}, area?:{id,province,city,district,postal_code},
--              discount_total?, promo_code?, referral_code?, user_id?}
--    Hanya service_role (server Vercel) yang boleh memanggil; ongkir/diskon dihitung server dan dibatasi di sini.
CREATE OR REPLACE FUNCTION public.create_order(payload jsonb, idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _key text := btrim(idempotency_key);
  _dup uuid;
  _line jsonb; _p record; _qty int; _slug text;
  _slugs text[] := ARRAY[]::text[];
  _subtotal bigint := 0; _discount bigint; _shipping bigint; _total bigint;
  _cust jsonb := coalesce(payload->'customer', '{}'::jsonb);
  _ship jsonb := coalesce(payload->'shipping', '{}'::jsonb);
  _area jsonb := coalesce(payload->'area', '{}'::jsonb);
  _name text := btrim(coalesce(_cust->>'name', ''));
  _wa text := btrim(coalesce(_cust->>'whatsapp', ''));
  _addr text := btrim(coalesce(_cust->>'address', ''));
  _pay text := coalesce(payload->>'payment_mode', 'whatsapp');
  _ship_mode text := coalesce(_ship->>'mode', 'manual');
  _branch_id uuid; _bname text; _bwa text;
  _order_id uuid; _number text; _token text; _try int := 0;
  _rows jsonb := '[]'::jsonb;
  _r jsonb;
BEGIN
  IF _key IS NULL OR length(_key) < 16 OR length(_key) > 100 THEN
    RAISE EXCEPTION 'idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT o.id INTO _dup FROM public.orders o WHERE o.idempotency_key = _key;
  IF FOUND THEN RETURN public.order_result_json(_dup, true); END IF;

  IF jsonb_typeof(payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'lines') NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'keranjang_kosong' USING ERRCODE = '22023';
  END IF;
  IF length(_name) < 2 OR length(_name) > 100 THEN RAISE EXCEPTION 'nama_tidak_valid' USING ERRCODE = '22023'; END IF;
  IF _wa !~ '^62[0-9]{8,13}$' THEN RAISE EXCEPTION 'whatsapp_tidak_valid' USING ERRCODE = '22023'; END IF;
  IF length(_addr) < 10 OR length(_addr) > 500 THEN RAISE EXCEPTION 'alamat_tidak_valid' USING ERRCODE = '22023'; END IF;
  IF _pay NOT IN ('whatsapp', 'midtrans', 'mock') THEN RAISE EXCEPTION 'metode_tidak_valid' USING ERRCODE = '22023'; END IF;
  IF _ship_mode NOT IN ('manual', 'biteship', 'mock') THEN RAISE EXCEPTION 'pengiriman_tidak_valid' USING ERRCODE = '22023'; END IF;

  -- Produk: harga dari database, bukan dari klien.
  FOR _line IN SELECT * FROM jsonb_array_elements(payload->'lines') LOOP
    _slug := btrim(coalesce(_line->>'slug', ''));
    IF _line->>'quantity' !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'jumlah_tidak_valid: %', _slug USING ERRCODE = '22023'; END IF;
    _qty := (_line->>'quantity')::int;
    IF _qty < 1 OR _qty > 99 THEN RAISE EXCEPTION 'jumlah_tidak_valid: %', _slug USING ERRCODE = '22023'; END IF;
    IF _slug = ANY (_slugs) THEN RAISE EXCEPTION 'produk_ganda: %', _slug USING ERRCODE = '22023'; END IF;
    _slugs := _slugs || _slug;
    SELECT id, sku, name, price, stock, is_active, is_blocked INTO _p FROM public.products WHERE slug = _slug;
    IF NOT FOUND OR NOT _p.is_active OR _p.is_blocked THEN RAISE EXCEPTION 'produk_tidak_tersedia: %', _slug USING ERRCODE = 'P0001'; END IF;
    IF _p.price IS NULL OR _p.price <= 0 THEN RAISE EXCEPTION 'produk_tanpa_harga: %', _slug USING ERRCODE = 'P0001'; END IF;
    IF _p.stock < _qty THEN RAISE EXCEPTION 'stok_kurang: %', _slug USING ERRCODE = 'P0001'; END IF;
    _subtotal := _subtotal + round(_p.price)::bigint * _qty;
    _rows := _rows || jsonb_build_object('product_id', _p.id, 'slug', _slug, 'sku', _p.sku, 'name', _p.name,
                                         'unit_price', round(_p.price)::int, 'quantity', _qty,
                                         'line_total', round(_p.price)::bigint * _qty);
  END LOOP;

  _discount := coalesce(nullif(payload->>'discount_total', '')::bigint, 0);
  _shipping := coalesce(nullif(_ship->>'cost', '')::bigint, 0);
  IF _discount < 0 OR _discount > _subtotal THEN RAISE EXCEPTION 'diskon_tidak_valid' USING ERRCODE = '22023'; END IF;
  IF _shipping < 0 OR _shipping > 10000000 THEN RAISE EXCEPTION 'ongkir_tidak_valid' USING ERRCODE = '22023'; END IF;
  _total := _subtotal - _discount + _shipping;

  -- Cabang: hanya cabang aktif dari database. Nomor admin pilihan server hanya diterima bila berformat benar.
  IF nullif(payload->>'branch_id', '') IS NOT NULL THEN
    SELECT b.id, b.name, b.whatsapp INTO _branch_id, _bname, _bwa
      FROM public.store_branches b WHERE b.id = (payload->>'branch_id')::uuid AND b.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'cabang_tidak_tersedia' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF coalesce(payload->>'branch_whatsapp', '') ~ '^62[0-9]{8,13}$' THEN _bwa := payload->>'branch_whatsapp'; END IF;

  LOOP
    _try := _try + 1;
    _number := 'VK-' || to_char(now() AT TIME ZONE 'UTC', 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    _token := substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 48);
    BEGIN
      INSERT INTO public.orders (
        order_number, access_token, user_id, payment_mode, status, shipping_mode, customer_name, whatsapp, address,
        province, city, district, postal_code, area_id, courier_company, courier_service, courier_label,
        subtotal, shipping_cost, total, discount_total, promo_code, referral_code, customer_note,
        branch_id, branch_name, branch_whatsapp, idempotency_key)
      VALUES (
        _number, _token, nullif(payload->>'user_id', '')::uuid, _pay,
        CASE WHEN _pay = 'whatsapp' THEN 'menunggu_konfirmasi' ELSE 'pending' END, _ship_mode, _name, _wa, _addr,
        coalesce(_area->>'province', ''), coalesce(_area->>'city', ''), coalesce(_area->>'district', ''),
        coalesce(_area->>'postal_code', ''), nullif(_area->>'id', ''),
        coalesce(nullif(_ship->>'company', ''), 'MANUAL'), coalesce(nullif(_ship->>'service', ''), 'MANUAL'),
        coalesce(nullif(_ship->>'label', ''), 'Dikonfirmasi cabang'),
        _subtotal, _shipping, _total, _discount, nullif(payload->>'promo_code', ''), nullif(payload->>'referral_code', ''),
        nullif(btrim(coalesce(_cust->>'note', '')), ''), _branch_id, _bname, _bwa, _key)
      RETURNING id INTO _order_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      SELECT o.id INTO _dup FROM public.orders o WHERE o.idempotency_key = _key;
      IF FOUND THEN RETURN public.order_result_json(_dup, true); END IF;
      IF _try >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  FOR _r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    INSERT INTO public.order_items (order_id, product_id, slug, sku, name, unit_price, quantity, line_total)
    VALUES (_order_id, (_r->>'product_id')::uuid, _r->>'slug', _r->>'sku', _r->>'name',
            (_r->>'unit_price')::int, (_r->>'quantity')::int, (_r->>'line_total')::int);
  END LOOP;
  RETURN public.order_result_json(_order_id, false);
END $$;
REVOKE ALL ON FUNCTION public.create_order(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, text) TO service_role;

-- 5. Cek pesanan lewat token: token >= 32 karakter acak (server membuat 48 hex dari gen_random_uuid),
--    hanya dapat dipanggil server (service_role), bukan langsung dari browser.
CREATE OR REPLACE FUNCTION public.get_order_by_token(_token text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'payment_mode', o.payment_mode,
    'shipping_mode', o.shipping_mode, 'customer_name', o.customer_name, 'city', o.city,
    'whatsapp', o.whatsapp, 'address', o.address, 'district', o.district, 'province', o.province,
    'postal_code', o.postal_code, 'branch_name', o.branch_name, 'branch_whatsapp', o.branch_whatsapp,
    'courier_label', o.courier_label, 'subtotal', o.subtotal, 'shipping_cost', o.shipping_cost,
    'discount_total', o.discount_total, 'promo_code', o.promo_code, 'customer_note', o.customer_note,
    'total', o.total, 'payment_url', CASE WHEN o.status = 'pending' THEN o.payment_url END,
    'created_at', o.created_at, 'paid_at', o.paid_at,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', i.slug, 'name', i.name,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.name)
      FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
  FROM public.orders o
  WHERE length(_token) >= 32 AND o.access_token = _token
$function$;
REVOKE ALL ON FUNCTION public.get_order_by_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(text) TO service_role;

-- 6. chat_rate_hits: tolak eksplisit semua akses langsung (hanya fungsi chat_rate_hit / service_role).
REVOKE ALL ON public.chat_rate_hits FROM anon, authenticated;
DO $$ BEGIN
  IF to_regclass('public.chat_rate_hits') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_rate_hits' AND policyname = 'deny direct access') THEN
    CREATE POLICY "deny direct access" ON public.chat_rate_hits FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- 7. Fungsi staf/admin: tidak bisa dipanggil anon (hanya pengguna masuk; tiap fungsi memeriksa peran di dalamnya).
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'public.admin_get_product_hpp(uuid[])', 'public.admin_set_product_hpp(uuid,numeric)',
    'public.has_permission(uuid,text)', 'public.owner_add_block(text,text,text)', 'public.owner_remove_block(text,text)',
    'public.staff_cancel_order(uuid)', 'public.staff_check_blocked(text[],text[])', 'public.staff_confirm_order(uuid)',
    'public.staff_find_customer(text)', 'public.staff_set_order_stage(uuid,text)', 'public.undo_product_import(uuid)',
    'public.update_my_customer(text,text,boolean)'
  ] LOOP
    IF to_regprocedure(s) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', s);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', s);
    END IF;
  END LOOP;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
  END IF;
  FOREACH s IN ARRAY ARRAY[
    'public.apply_order_payment_status(uuid,text,text)', 'public.claim_customer_for_user(uuid,text,text)',
    'public.upsert_customer_for_order(text,text,text,boolean,uuid,bigint)'
  ] LOOP
    IF to_regprocedure(s) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', s);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', s);
    END IF;
  END LOOP;
END $$;

-- 8. Katalog: produk bertanda foto lebih dulu (kolom turunan; hak baca kolom eksplisit karena products memakai hak per kolom).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_image boolean GENERATED ALWAYS AS (coalesce(image_url, '') <> '') STORED;
GRANT SELECT (has_image) ON public.products TO anon, authenticated;
