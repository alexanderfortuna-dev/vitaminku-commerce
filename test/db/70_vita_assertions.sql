-- Vita cerdas (migrasi 0017) di Postgres 16 LOKAL: pencarian tanpa HPP & patuh RLS, statistik hanya service_role, wawasan hanya staf.
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
INSERT INTO auth.users(id,email) SELECT gen_random_uuid(), n||'@vt' FROM unnest(ARRAY['owner','cust']) n;
INSERT INTO ids SELECT split_part(email,'@',1), id FROM auth.users WHERE email LIKE '%@vt';
INSERT INTO public.user_roles(user_id,role,is_active) SELECT v,'owner',true FROM ids WHERE k='owner';
INSERT INTO public.products(sku,name,brand,category,subcategory,price,hpp,stock,slug,is_active,weight_grams,images)
  VALUES ('VT-1','Vita Whey Uji 2lbs','UjiA','Sport Nutrition','Protein',300000,111111,5,'vt-1',true,900,ARRAY['https://example.test/a.jpg']),
         ('VT-2','Vita Creatine Uji 300g','UjiB','Sport Nutrition','Creatine',150000,22222,0,'vt-2',true,300,ARRAY['https://example.test/b.jpg']),
         ('VT-3','Vita Whey Draf','UjiC','Sport Nutrition','Protein',250000,1,5,'vt-3',false,900,ARRAY['https://example.test/c.jpg']);

DO $$
DECLARE o uuid := (SELECT v FROM ids WHERE k='owner'); c uuid := (SELECT v FROM ids WHERE k='cust'); x text; n int;
BEGIN
  -- Pencarian sebagai anon
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.vita_search(ARRAY['whey uji'], ARRAY[]::text[], NULL, 30) s WHERE s.slug LIKE 'vt-%';
  INSERT INTO r VALUES ('anon: cari "whey uji" menemukan produk aktif saja', n = 1, n::text);
  SELECT count(*) INTO n FROM public.vita_search(ARRAY['vita whey ujii'], ARRAY[]::text[], NULL, 30) s WHERE s.slug = 'vt-1';
  INSERT INTO r VALUES ('anon: salah ketik "vita whey ujii" tetap ketemu (trigram)', n = 1, n::text);
  SELECT count(*) INTO n FROM public.vita_search(ARRAY['whey uji'], ARRAY[]::text[], 200000, 30) s WHERE s.slug LIKE 'vt-%';
  INSERT INTO r VALUES ('anon: budget adalah batas keras', n = 0, n::text);
  SELECT count(*) INTO n FROM public.vita_search(ARRAY[]::text[], ARRAY['Creatine'], NULL, 30) s WHERE s.slug = 'vt-2';
  INSERT INTO r VALUES ('anon: produk stok habis tidak muncul', n = 0, n::text);
  SELECT count(*) INTO n FROM public.vita_search(ARRAY[]::text[], ARRAY['Protein'], NULL, 30) s WHERE s.slug = 'vt-1' AND s.in_stock;
  INSERT INTO r VALUES ('anon: cari per subkategori; stok hanya ada/tidak', n = 1, n::text);
  RESET ROLE;
  INSERT INTO r SELECT 'hasil pencarian tidak punya kolom hpp/stock',
    NOT EXISTS (SELECT 1 FROM unnest(proargnames) a WHERE a IN ('hpp','stock')) , array_to_string(proargnames, ',')
    FROM pg_proc WHERE proname = 'vita_search';
  INSERT INTO r SELECT 'vita_search SECURITY INVOKER (RLS berlaku)', NOT prosecdef, '' FROM pg_proc WHERE proname = 'vita_search';

  -- Statistik
  x := pg_temp.as_user(NULL,'anon',$q$SELECT public.vita_log_event('answer','abcdef12','x','protein',true,NULL,'keyword')$q$);
  INSERT INTO r VALUES ('anon tidak boleh menulis statistik', x='ERR 42501', x);
  x := pg_temp.as_user(c,'authenticated',$q$SELECT public.vita_log_event('answer','abcdef12','x','protein',true,NULL,'keyword')$q$);
  INSERT INTO r VALUES ('pelanggan login tidak boleh menulis statistik', x='ERR 42501', x);
  x := pg_temp.as_user(NULL,'service_role',$q$SELECT public.vita_log_event('answer','abcdef12','sirup herbal','protein',true,NULL,'keyword')$q$);
  INSERT INTO r VALUES ('server (service_role) menulis statistik', x='OK', x);
  x := pg_temp.as_user(NULL,'service_role',$q$SELECT public.vita_log_event('answer','abcdef13','whey murah','protein',false,NULL,'keyword')$q$);
  INSERT INTO r VALUES ('teks kueri hanya disimpan bila tanpa hasil', x='OK' AND (SELECT query_text FROM public.vita_events WHERE query_hash='abcdef13') IS NULL, x);
  x := pg_temp.as_user(NULL,'service_role',$q$SELECT public.vita_log_event('answer','BUKAN-HASH','x',NULL,false,NULL,NULL)$q$);
  INSERT INTO r VALUES ('hash tidak valid ditolak (CHECK)', x='ERR 23514', x);
  x := pg_temp.as_user(NULL,'anon','SELECT count(*) FROM public.vita_events');
  INSERT INTO r VALUES ('anon tidak bisa membaca statistik', x='ERR 42501', x);

  -- Wawasan
  x := pg_temp.as_user(c,'authenticated','SELECT public.vita_insight(30)');
  INSERT INTO r VALUES ('pelanggan login ditolak membaca wawasan', x='ERR 42501', x);
  x := pg_temp.as_user(NULL,'anon','SELECT public.vita_insight(30)');
  INSERT INTO r VALUES ('anon ditolak membaca wawasan', x='ERR 42501', x);
  PERFORM set_config('request.jwt.claim.sub', o::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO r SELECT 'owner membaca wawasan (kueri tanpa hasil teratas)',
    (j->>'zero_results')::int = 1 AND j->'top_zero'->0->>'query_text' = 'sirup herbal', j::text
    FROM (SELECT public.vita_insight(30) j) s;
  RESET ROLE;
END $$;
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE detail END AS detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
