-- Asersi DB pesanan (Postgres 16 LOKAL): create_order atomik/idempoten, harga dari DB, anon tertutup.
CREATE TEMP TABLE r(name text, ok boolean, detail text);
GRANT ALL ON r TO PUBLIC;
CREATE FUNCTION pg_temp.try_as(_role text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE res text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', _role);
  BEGIN EXECUTE _sql INTO res; res := coalesce(res, 'OK'); EXCEPTION WHEN OTHERS THEN res := 'ERR ' || SQLSTATE || ' ' || SQLERRM; END;
  RESET ROLE;
  RETURN res;
END $$;

INSERT INTO public.store_branches(id,name,area,whatsapp,code,is_active) VALUES
  ('00000000-0000-0000-0000-0000000000a1','Sanur','Bali','6281111111111','SANUR',true),
  ('00000000-0000-0000-0000-0000000000a2','Tutup','Bali','6282222222222','TUTUP',false);
INSERT INTO public.products(sku,name,brand,category,subcategory,price,stock,slug,is_active,weight_grams,images) VALUES
  ('OR-A','Whey Uji A','Uji','Sports','Uji',100000,10,'or-a',true,500,ARRAY['https://example.test/a.jpg']),
  ('OR-B','Vitamin Uji B','Uji','Vitamin','Uji',50000,2,'or-b',true,200,ARRAY['https://example.test/b.jpg']),
  ('OR-C','Tanpa Harga C','Uji','Vitamin','Uji',NULL,5,'or-c',false,200,ARRAY[]::text[]);
INSERT INTO public.products(sku,name,brand,category,subcategory,price,stock,slug,is_active,weight_grams,images) VALUES
  ('OR-D','Modafinil Uji D','Uji','Vitamin','Uji',50000,5,'or-d',true,200,ARRAY['https://example.test/d.jpg']);

CREATE TEMP TABLE out(k text PRIMARY KEY, v jsonb);
CREATE TEMP TABLE base AS SELECT (SELECT count(*) FROM public.orders) AS o, (SELECT count(*) FROM public.order_items) AS i;
GRANT ALL ON base TO PUBLIC;
GRANT ALL ON out TO PUBLIC;

-- payload dasar; unit_price palsu dari klien harus diabaikan
CREATE FUNCTION pg_temp.pl(_lines text, _extra text DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT ('{"customer":{"name":"Budi Uji","whatsapp":"6281234567890","address":"Jl. Uji No. 1, Sanur, Denpasar"},"lines":' || _lines || '}')::jsonb || _extra::jsonb
$$;

DO $$ DECLARE a jsonb; b jsonb; n int; BEGIN
  SET LOCAL ROLE service_role;
  a := public.create_order(pg_temp.pl('[{"slug":"or-a","quantity":2,"unit_price":1,"price":1},{"slug":"or-b","quantity":1}]',
        '{"branch_id":"00000000-0000-0000-0000-0000000000a1","shipping":{"cost":15000},"discount_total":5000}'), 'kunci-uji-0001-abcdefgh');
  b := public.create_order(pg_temp.pl('[{"slug":"or-a","quantity":2}]'), 'kunci-uji-0001-abcdefgh');
  RESET ROLE;
  SELECT count(*) INTO n FROM public.orders WHERE idempotency_key = 'kunci-uji-0001-abcdefgh';
  INSERT INTO pg_temp.r VALUES ('harga klien palsu diabaikan: subtotal dari DB (2x100000+50000)', (a->>'subtotal')::int = 250000, a->>'subtotal');
  INSERT INTO pg_temp.r VALUES ('total = subtotal - diskon + ongkir', (a->>'total')::int = 260000, a->>'total');
  INSERT INTO pg_temp.r VALUES ('unit_price baris dari DB', (a->'items'->0->>'unit_price')::int IN (100000,50000) AND (a->'items'->1->>'unit_price')::int IN (100000,50000), a->'items'::text);
  INSERT INTO pg_temp.r VALUES ('kirim ganda kunci sama = 1 pesanan', n = 1 AND (b->>'duplicate')::boolean AND b->>'order_number' = a->>'order_number', n::text);
  INSERT INTO pg_temp.r VALUES ('token pesanan >= 32 karakter hex', length(a->>'access_token') = 48 AND a->>'access_token' ~ '^[0-9a-f]{48}$', length(a->>'access_token')::text);
  INSERT INTO pg_temp.r VALUES ('nomor WA tujuan = cabang pilihan dari DB', a->>'branch_whatsapp' = '6281111111111', a->>'branch_whatsapp');
  INSERT INTO pg_temp.r VALUES ('status WhatsApp = menunggu_konfirmasi', a->>'status' = 'menunggu_konfirmasi', a->>'status');
  INSERT INTO out VALUES ('a', a);
END $$;

-- penolakan
INSERT INTO r SELECT 'produk nonaktif ditolak', pg_temp.try_as('service_role', $q$ SELECT public.create_order(pg_temp.pl('[{"slug":"or-c","quantity":1}]'),'kunci-uji-0002-abcdefgh')::text $q$) LIKE 'ERR P0001 produk_tidak_tersedia%', '';
INSERT INTO r SELECT 'produk terblokir (modafinil) ditolak', pg_temp.try_as('service_role', $q$ SELECT public.create_order(pg_temp.pl('[{"slug":"or-d","quantity":1}]'),'kunci-uji-0003-abcdefgh')::text $q$) LIKE 'ERR P0001 produk_tidak_tersedia%', '';
INSERT INTO r SELECT 'stok kurang ditolak', pg_temp.try_as('service_role', $q$ SELECT public.create_order(pg_temp.pl('[{"slug":"or-b","quantity":3}]'),'kunci-uji-0004-abcdefgh')::text $q$) LIKE 'ERR P0001 stok_kurang%', '';
INSERT INTO r SELECT 'cabang nonaktif ditolak', pg_temp.try_as('service_role', $q$ SELECT public.create_order(pg_temp.pl('[{"slug":"or-b","quantity":1}]','{"branch_id":"00000000-0000-0000-0000-0000000000a2"}'),'kunci-uji-0005-abcdefgh')::text $q$) LIKE 'ERR P0001 cabang_tidak_tersedia%', '';
INSERT INTO r SELECT 'diskon lebih besar dari subtotal ditolak', pg_temp.try_as('service_role', $q$ SELECT public.create_order(pg_temp.pl('[{"slug":"or-b","quantity":1}]','{"discount_total":999999}'),'kunci-uji-0006-abcdefgh')::text $q$) LIKE 'ERR 22023 diskon_tidak_valid%', '';
INSERT INTO r SELECT 'kunci idempotensi pendek ditolak', pg_temp.try_as('service_role', $q$ SELECT public.create_order(pg_temp.pl('[{"slug":"or-b","quantity":1}]'),'pendek')::text $q$) LIKE 'ERR 22023 idempotency_key_invalid%', '';
INSERT INTO r SELECT 'penolakan tidak meninggalkan pesanan setengah jadi', (SELECT count(*) FROM public.orders) = (SELECT o FROM base) + 1 AND (SELECT count(*) FROM public.order_items) = (SELECT i FROM base) + 2, (SELECT count(*) FROM public.orders)::text;

-- anon / authenticated tertutup
INSERT INTO r SELECT 'anon TIDAK bisa INSERT langsung ke orders', pg_temp.try_as('anon', $q$ INSERT INTO public.orders(order_number,access_token,payment_mode,customer_name,whatsapp,address,province,city,district,postal_code,courier_company,courier_service,courier_label,shipping_mode,subtotal,shipping_cost,total) VALUES ('X','Y','whatsapp','a','b','c','','','','','','','','manual',1,0,1) $q$) LIKE 'ERR 42501%', '';
INSERT INTO r SELECT 'anon TIDAK bisa membaca orders', pg_temp.try_as('anon', $q$ SELECT count(*)::text FROM public.orders $q$) LIKE 'ERR 42501%', '';
INSERT INTO r SELECT 'anon TIDAK bisa memanggil create_order', pg_temp.try_as('anon', $q$ SELECT public.create_order('{}'::jsonb,'kunci-uji-0007-abcdefgh')::text $q$) LIKE 'ERR 42501%', '';
INSERT INTO r SELECT 'authenticated TIDAK bisa memanggil create_order', pg_temp.try_as('authenticated', $q$ SELECT public.create_order('{}'::jsonb,'kunci-uji-0007-abcdefgh')::text $q$) LIKE 'ERR 42501%', '';
INSERT INTO r SELECT 'anon TIDAK bisa get_order_by_token', pg_temp.try_as('anon', $q$ SELECT public.get_order_by_token('x')::text $q$) LIKE 'ERR 42501%', '';
INSERT INTO r SELECT 'anon TIDAK bisa fungsi staf', pg_temp.try_as('anon', $q$ SELECT public.staff_confirm_order(gen_random_uuid())::text $q$) LIKE 'ERR 42501%', '';
INSERT INTO r SELECT 'anon TIDAK bisa admin_get_product_hpp', pg_temp.try_as('anon', $q$ SELECT public.admin_get_product_hpp(ARRAY[gen_random_uuid()])::text $q$) LIKE 'ERR 42501%', '';
INSERT INTO r SELECT 'anon TIDAK bisa membaca chat_rate_hits', pg_temp.try_as('anon', $q$ SELECT count(*)::text FROM public.chat_rate_hits $q$) LIKE 'ERR 42501%', '';
INSERT INTO r SELECT 'chat_rate_hits punya kebijakan tolak eksplisit', EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_rate_hits' AND policyname='deny direct access'), '';
INSERT INTO r SELECT 'anon masih bisa chat_rate_hit & public_branch_contacts', pg_temp.try_as('anon', $q$ SELECT public.chat_rate_hit(repeat('a',64),20,10)::text $q$) = 'true'
  AND pg_temp.try_as('anon', $q$ SELECT count(*)::text FROM public.public_branch_contacts() $q$) NOT LIKE 'ERR%', '';

-- token pendek tidak pernah cocok; token benar cocok (server)
INSERT INTO r SELECT 'get_order_by_token: token pendek -> kosong', pg_temp.try_as('service_role', $q$ SELECT coalesce(public.get_order_by_token('abc')::text,'NULL') $q$) = 'NULL', '';
INSERT INTO r SELECT 'get_order_by_token: token benar -> pesanan', pg_temp.try_as('service_role', format($q$ SELECT public.get_order_by_token(%L)->>'order_number' $q$, (SELECT v->>'access_token' FROM out WHERE k='a'))) = (SELECT v->>'order_number' FROM out WHERE k='a'), '';

-- indeks unik idempotensi (jaring pengaman balapan)
INSERT INTO r SELECT 'indeks unik idempotency_key ada & unik', EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='orders_idempotency_key_uq' AND indexdef ILIKE '%UNIQUE%'), '';
-- has_image
INSERT INTO r SELECT 'has_image: produk berfoto true, tanpa foto false', (SELECT has_image FROM public.products WHERE sku='OR-A') AND NOT (SELECT has_image FROM public.products WHERE sku='OR-C'), '';
INSERT INTO r SELECT 'anon boleh membaca has_image', pg_temp.try_as('anon', $q$ SELECT count(*)::text FROM (SELECT has_image FROM public.products LIMIT 1) t $q$) NOT LIKE 'ERR%', '';

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE detail END AS detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
