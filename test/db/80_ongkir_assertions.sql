-- Ongkir nyata & link bayar (migrasi 0018) di Postgres 16 LOKAL: ukuran produk, data cabang, ongkir oleh staf.
CREATE TEMP TABLE r(name text, ok boolean, detail text);
CREATE TEMP TABLE ids(k text PRIMARY KEY, v uuid);
GRANT ALL ON r, ids TO PUBLIC;
CREATE FUNCTION pg_temp.as_user(_uid uuid, _role text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE res text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', _role);
  BEGIN EXECUTE _sql; res := 'OK'; EXCEPTION WHEN OTHERS THEN res := 'ERR ' || SQLSTATE; END;
  RESET ROLE;
  RETURN res;
END $$;
INSERT INTO auth.users(id,email) SELECT gen_random_uuid(), n||'@og' FROM unnest(ARRAY['owner','cust']) n;
INSERT INTO ids SELECT split_part(email,'@',1), id FROM auth.users WHERE email LIKE '%@og';
INSERT INTO public.user_roles(user_id,role,is_active) SELECT v,'owner',true FROM ids WHERE k='owner';
INSERT INTO public.products(sku,name,brand,category,subcategory,price,hpp,stock,slug,is_active,weight_grams,images)
  VALUES ('OG-1','Ongkir Uji 1','UjiA','Sport Nutrition','Protein',100000,1,9,'og-1',true,400,ARRAY['https://example.test/a.jpg']);
INSERT INTO public.orders(order_number,access_token,status,payment_mode,customer_name,whatsapp,address,province,city,district,postal_code,
    courier_company,courier_service,courier_label,shipping_mode,subtotal,shipping_cost,total,discount_total)
  VALUES ('OG-MAN-1', md5(random()::text) || md5('og-man'), 'menunggu_konfirmasi','whatsapp','Uji','6281200000001','Jl. Uji 1','Bali','Denpasar','Sanur','80228',
    'manual','admin','Ongkir dikonfirmasi cabang','manual',200000,0,190000,10000),
    ('OG-BIT-1', md5(random()::text) || md5('og-bit'), 'menunggu_konfirmasi','whatsapp','Uji','6281200000002','Jl. Uji 2','Bali','Denpasar','Sanur','80228',
    'jne','reg','JNE REG','biteship',200000,15000,215000,0);

DO $$
DECLARE o uuid := (SELECT v FROM ids WHERE k='owner'); c uuid := (SELECT v FROM ids WHERE k='cust'); x text; n int; t int;
        mid uuid := (SELECT id FROM public.orders WHERE order_number='OG-MAN-1'); bid uuid := (SELECT id FROM public.orders WHERE order_number='OG-BIT-1');
BEGIN
  -- Ukuran produk
  UPDATE public.products SET length_cm = 30, width_cm = 20, height_cm = 10 WHERE sku = 'OG-1';
  INSERT INTO r SELECT 'ukuran produk tersimpan (30×20×10)', length_cm = 30 AND width_cm = 20 AND height_cm = 10, length_cm::text FROM public.products WHERE sku='OG-1';
  x := pg_temp.as_user(NULL,'service_role',$q$UPDATE public.products SET length_cm = 0 WHERE sku='OG-1'$q$);
  INSERT INTO r VALUES ('ukuran 0 ditolak (CHECK > 0)', x = 'ERR 23514', x);
  x := pg_temp.as_user(NULL,'service_role',$q$UPDATE public.products SET height_cm = -3 WHERE sku='OG-1'$q$);
  INSERT INTO r VALUES ('ukuran negatif ditolak', x = 'ERR 23514', x);
  x := pg_temp.as_user(NULL,'service_role',$q$UPDATE public.products SET length_cm = NULL, width_cm = NULL, height_cm = NULL WHERE sku='OG-1'$q$);
  INSERT INTO r VALUES ('ukuran boleh dikosongkan (tanpa tebakan)', x = 'OK', x);

  -- Hak kolom
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.products WHERE sku='OG-1' AND length_cm IS NULL;
  RESET ROLE;
  INSERT INTO r VALUES ('anon boleh membaca kolom ukuran', n = 1, n::text);
  x := pg_temp.as_user(NULL,'anon',$q$UPDATE public.products SET length_cm = 5 WHERE sku='OG-1'$q$);
  INSERT INTO r VALUES ('anon tidak boleh menulis ukuran', x LIKE 'ERR%', x);
  x := pg_temp.as_user(NULL,'anon','SELECT hpp FROM public.products LIMIT 1');
  INSERT INTO r VALUES ('hpp tetap tertutup untuk anon', x = 'ERR 42501', x);

  -- Cabang
  INSERT INTO public.store_branches(name, area, whatsapp, display_order) VALUES ('Cabang Uji OG', 'Sanur', '6281234567890', 99);
  INSERT INTO r SELECT 'instant_delivery default MATI', NOT instant_delivery, instant_delivery::text FROM public.store_branches WHERE name='Cabang Uji OG';
  x := pg_temp.as_user(NULL,'service_role',$q$UPDATE public.store_branches SET postal_code = '8022' WHERE name='Cabang Uji OG'$q$);
  INSERT INTO r VALUES ('kode pos cabang harus 5 digit', x = 'ERR 23514', x);
  x := pg_temp.as_user(NULL,'service_role',$q$UPDATE public.store_branches SET postal_code = '80228' WHERE name='Cabang Uji OG'$q$);
  INSERT INTO r VALUES ('kode pos 5 digit diterima', x = 'OK', x);

  -- Ongkir oleh staf
  x := pg_temp.as_user(NULL,'anon',format('SELECT public.staff_set_shipping(%L, 20000)', mid));
  INSERT INTO r VALUES ('anon ditolak mengisi ongkir', x = 'ERR 42501', x);
  x := pg_temp.as_user(c,'authenticated',format('SELECT public.staff_set_shipping(%L, 20000)', mid));
  INSERT INTO r VALUES ('pelanggan login ditolak mengisi ongkir', x = 'ERR 42501', x);
  x := pg_temp.as_user(o,'authenticated',format('SELECT public.staff_set_shipping(%L, -1)', mid));
  INSERT INTO r VALUES ('ongkir negatif ditolak', x LIKE 'ERR%', x);
  x := pg_temp.as_user(o,'authenticated',format('SELECT public.staff_set_shipping(%L, 3000000)', mid));
  INSERT INTO r VALUES ('ongkir di atas batas ditolak', x LIKE 'ERR%', x);
  x := pg_temp.as_user(o,'authenticated',format('SELECT public.staff_set_shipping(%L, 20000)', bid));
  INSERT INTO r VALUES ('ongkir kurir (biteship) tidak bisa diubah staf', x LIKE 'ERR%', x);
  PERFORM set_config('request.jwt.claim.sub', o::text, true);
  SET LOCAL ROLE authenticated;
  SELECT public.staff_set_shipping(mid, 25000) INTO t;
  RESET ROLE;
  INSERT INTO r SELECT 'owner mengisi ongkir: total = subtotal − diskon + ongkir (200000−10000+25000)', t = 215000 AND total = 215000 AND shipping_cost = 25000, total::text FROM public.orders WHERE id = mid;
  INSERT INTO r SELECT 'pengisian ongkir tercatat di jejak audit', count(*) = 1, count(*)::text FROM public.admin_audit_log WHERE action = 'order_set_shipping';
  UPDATE public.orders SET payment_token = 'tok_uji', payment_url = 'https://example.test/pay', payment_link_at = now() WHERE id = mid;
  x := pg_temp.as_user(o,'authenticated',format('SELECT public.staff_set_shipping(%L, 30000)', mid));
  INSERT INTO r VALUES ('setelah link bayar dibuat ongkir dikunci', x LIKE 'ERR%' AND (SELECT total FROM public.orders WHERE id = mid) = 215000, x);
  UPDATE public.orders SET status = 'paid' WHERE id = bid;
  x := pg_temp.as_user(o,'authenticated',format('SELECT public.staff_set_shipping(%L, 1)', bid));
  INSERT INTO r VALUES ('pesanan lunas tidak bisa diubah ongkirnya', x LIKE 'ERR%', x);
END $$;
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE detail END AS detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
