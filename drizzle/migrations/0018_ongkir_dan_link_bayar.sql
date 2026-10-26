-- 0018 Ongkir nyata & link bayar (Rilis 5). Aditif & idempoten. BELUM dipasang ke produksi (dipasang owner lewat mode pasang-database).
-- 1) Ukuran produk (cm) untuk berat volume kurir. Boleh kosong; bila diisi harus > 0. Tidak ada tebakan.
-- 2) Data cabang untuk ongkir: kode pos asal, area Biteship, dan saklar kurir instan (default MATI, diisi owner).
-- 3) Pesanan WhatsApp: staf mengisi ongkir lewat fungsi ber-izin, lalu link bayar Midtrans dibuat dari total di database.
-- Sebelum 0018 dipasang, kode otomatis memakai berat saja (tanpa ukuran) dan tombol link bayar menolak dengan pesan jelas.

-- 1) Ukuran produk
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS length_cm numeric(7,1) CHECK (length_cm IS NULL OR length_cm > 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS width_cm  numeric(7,1) CHECK (width_cm  IS NULL OR width_cm  > 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS height_cm numeric(7,1) CHECK (height_cm IS NULL OR height_cm > 0);
GRANT SELECT (length_cm, width_cm, height_cm) ON public.products TO anon, authenticated;
GRANT INSERT (length_cm, width_cm, height_cm), UPDATE (length_cm, width_cm, height_cm) ON public.products TO authenticated;

-- 2) Cabang
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS postal_code text CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{5}$');
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS area_id text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS instant_delivery boolean NOT NULL DEFAULT false;

-- 3) Pesanan: waktu link bayar dibuat (token & url sudah ada: payment_token, payment_url)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_link_at timestamptz;

-- Staf mengisi ongkir pesanan WhatsApp (mode manual) SEBELUM link bayar dibuat. Total dihitung ulang di database.
CREATE OR REPLACE FUNCTION public.staff_set_shipping(_order_id uuid, _cost integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders%ROWTYPE; _total integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _cost IS NULL OR _cost < 0 OR _cost > 2000000 THEN RAISE EXCEPTION 'Ongkir harus 0 sampai 2.000.000.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan tidak ditemukan'; END IF;
  IF o.shipping_mode <> 'manual' THEN RAISE EXCEPTION 'Ongkir pesanan ini sudah dihitung kurir dan tidak bisa diubah.'; END IF;
  IF o.status NOT IN ('menunggu_konfirmasi','pending') THEN RAISE EXCEPTION 'Pesanan sudah %', o.status; END IF;
  IF o.payment_token IS NOT NULL THEN RAISE EXCEPTION 'Link bayar sudah dibuat; ongkir tidak bisa diubah lagi.'; END IF;
  _total := o.subtotal - o.discount_total + _cost;
  UPDATE public.orders SET shipping_cost = _cost, total = _total, updated_at = now() WHERE id = _order_id;
  INSERT INTO public.admin_audit_log(user_id, action, payload)
    VALUES (auth.uid(), 'order_set_shipping', jsonb_build_object('order_number', o.order_number, 'old', o.shipping_cost, 'new', _cost, 'total', _total));
  RETURN _total;
END $$;
REVOKE ALL ON FUNCTION public.staff_set_shipping(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_shipping(uuid, integer) TO authenticated;

-- 4) Batalkan impor terakhir juga memulihkan ukuran, hanya bila cadangan impor itu memuat ukuran (cadangan lama tidak punya kuncinya).
CREATE OR REPLACE FUNCTION public.undo_product_import(_import_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE imp public.product_imports%ROWTYPE; r record; restored int := 0; archived int := 0;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'uploads_use') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO imp FROM public.product_imports WHERE id = _import_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Impor tidak ditemukan'; END IF;
  IF imp.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Impor ini sudah dibatalkan'; END IF;
  IF EXISTS (SELECT 1 FROM public.product_imports x WHERE x.undone_at IS NULL AND x.created_at > imp.created_at) THEN
    RAISE EXCEPTION 'Hanya impor terakhir yang bisa dibatalkan';
  END IF;
  FOR r IN SELECT * FROM public.product_import_rows WHERE import_id = _import_id LOOP
    IF r.existed THEN
      UPDATE public.products p SET
        name = coalesce(r.before->>'name', p.name), brand = coalesce(r.before->>'brand', p.brand),
        category = coalesce(r.before->>'category', p.category), subcategory = coalesce(r.before->>'subcategory', p.subcategory),
        size = r.before->>'size', pack_count = r.before->>'pack_count', servings = r.before->>'servings',
        dose = r.before->>'dose', flavor = r.before->>'flavor', description = r.before->>'description',
        price = (r.before->>'price')::numeric, compare_at_price = (r.before->>'compare_at_price')::numeric,
        stock = coalesce((r.before->>'stock')::int, p.stock), weight_grams = (r.before->>'weight_grams')::int,
        length_cm = CASE WHEN r.before ? 'length_cm' THEN (r.before->>'length_cm')::numeric ELSE p.length_cm END,
        width_cm  = CASE WHEN r.before ? 'width_cm'  THEN (r.before->>'width_cm')::numeric  ELSE p.width_cm  END,
        height_cm = CASE WHEN r.before ? 'height_cm' THEN (r.before->>'height_cm')::numeric ELSE p.height_cm END,
        bpom_number = r.before->>'bpom_number',
        images = coalesce(ARRAY(SELECT jsonb_array_elements_text(r.before->'images')), p.images),
        variant_group = r.before->>'variant_group',
        is_active = coalesce((r.before->>'is_active')::boolean, p.is_active)
      WHERE p.sku = r.sku;
      restored := restored + 1;
    ELSE
      UPDATE public.products SET is_active = false WHERE sku = r.sku;
      archived := archived + 1;
    END IF;
  END LOOP;
  UPDATE public.product_imports SET undone_at = now() WHERE id = _import_id;
  INSERT INTO public.admin_audit_log(user_id, action, payload)
    VALUES (auth.uid(), 'import_undo', jsonb_build_object('import_id', _import_id, 'restored', restored, 'archived', archived));
  RETURN jsonb_build_object('restored', restored, 'archived', archived);
END $$;
REVOKE ALL ON FUNCTION public.undo_product_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_product_import(uuid) TO authenticated;
