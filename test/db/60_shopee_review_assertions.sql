-- Antrean tinjau foto Shopee (Postgres 16 LOKAL): hanya pemegang izin products_photos; products tidak tersentuh.
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
INSERT INTO auth.users(id,email) SELECT gen_random_uuid(), n||'@sp' FROM unnest(ARRAY['seller','cust']) n;
INSERT INTO ids SELECT split_part(email,'@',1), id FROM auth.users WHERE email LIKE '%@sp';
INSERT INTO public.user_roles(user_id,role,is_active) SELECT v,'seller',true FROM ids WHERE k='seller';
INSERT INTO public.products(sku,name,brand,category,subcategory,price,stock,slug,is_active,weight_grams,images)
  VALUES ('SP-1','Whey Uji Shopee','Uji','Sports','Uji',100000,3,'sp-1',true,500,ARRAY[]::text[]);
INSERT INTO ids SELECT 'prod', id FROM public.products WHERE sku='SP-1';
CREATE TEMP TABLE before AS SELECT name, description, category FROM public.products WHERE sku='SP-1';
DO $$
DECLARE s uuid := (SELECT v FROM ids WHERE k='seller'); c uuid := (SELECT v FROM ids WHERE k='cust'); p uuid := (SELECT v FROM ids WHERE k='prod'); x text;
BEGIN
  x := pg_temp.as_user(s,'authenticated',format($q$INSERT INTO public.shopee_photo_candidates(product_id,shopee_item_id,shopee_name,score,reason,image_urls) VALUES (%L,'111','Whey Uji Shopee 2 lbs',0.7,'uji',ARRAY['https://cf.example/a'])$q$,p));
  INSERT INTO r VALUES ('tim produk boleh mengisi antrean', x='OK', x);
  x := pg_temp.as_user(s,'authenticated',format($q$INSERT INTO public.shopee_photo_candidates(product_id,shopee_item_id,shopee_name,score,reason,image_urls) VALUES (%L,'111','dup',0.7,'uji',ARRAY['https://cf.example/a'])$q$,p));
  INSERT INTO r VALUES ('kandidat ganda (produk, item) ditolak', x='ERR 23505', x);
  x := pg_temp.as_user(s,'authenticated',format($q$INSERT INTO public.shopee_photo_candidates(product_id,shopee_item_id,shopee_name,score,reason,image_urls) VALUES (%L,'222','x',0.7,'uji',ARRAY[]::text[])$q$,p));
  INSERT INTO r VALUES ('tanpa foto ditolak (CHECK)', x='ERR 23514', x);
  x := pg_temp.as_user(s,'authenticated',$q$UPDATE public.shopee_photo_candidates SET status='applied', decided_at=now() WHERE shopee_item_id='111'$q$);
  INSERT INTO r VALUES ('tim produk boleh memutuskan', x='OK' AND (SELECT status FROM public.shopee_photo_candidates WHERE shopee_item_id='111')='applied', x);
  x := pg_temp.as_user(s,'authenticated',$q$DELETE FROM public.shopee_photo_candidates$q$);
  INSERT INTO r VALUES ('tidak ada hapus permanen', x='ERR 42501', x);
  x := pg_temp.as_user(c,'authenticated','SELECT count(*) FROM public.shopee_photo_candidates');
  INSERT INTO r VALUES ('pelanggan login: baca ditolak/kosong', x='OK' AND (SELECT count(*) FROM public.shopee_photo_candidates)=1, x);
  PERFORM set_config('request.jwt.claim.sub', c::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO r VALUES ('pelanggan login tidak melihat baris', (SELECT count(*) FROM public.shopee_photo_candidates)=0, '');
  RESET ROLE;
  x := pg_temp.as_user(c,'authenticated',format($q$INSERT INTO public.shopee_photo_candidates(product_id,shopee_item_id,shopee_name,score,reason,image_urls) VALUES (%L,'333','x',0.7,'uji',ARRAY['https://cf.example/a'])$q$,p));
  INSERT INTO r VALUES ('pelanggan login tidak boleh menulis', x='ERR 42501', x);
  x := pg_temp.as_user(NULL,'anon','SELECT count(*) FROM public.shopee_photo_candidates');
  INSERT INTO r VALUES ('anon ditolak', x='ERR 42501', x);
END $$;
INSERT INTO r SELECT 'products tidak berubah (nama/deskripsi/kategori)', (SELECT count(*) FROM public.products p JOIN before b ON b.name=p.name AND b.description IS NOT DISTINCT FROM p.description AND b.category=p.category WHERE p.sku='SP-1') = 1, '';
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE detail END AS detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
