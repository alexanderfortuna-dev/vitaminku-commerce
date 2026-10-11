-- Asersi hasil migrasi (dibandingkan dengan keadaan nyata database Lovable per 2026-10-12, hasil baca-saja).
CREATE TEMP TABLE r(name text, ok boolean, detail text);
GRANT ALL ON r TO PUBLIC;
DO $$
DECLARE
  live_cols text[] := ARRAY['id','sku','name','brand','category','subcategory','size','pack_count','servings','dose','flavor','price','compare_at_price','hpp','stock','image_url','description','bpom_number','is_active','slug','created_at','updated_at','is_blocked','blocked_reason','is_purchasable','weight_grams','images','variant_group','publish_issue','is_hero'];
  anon_sel text[] := ARRAY['blocked_reason','bpom_number','brand','category','compare_at_price','created_at','description','dose','flavor','id','image_url','images','is_active','is_blocked','is_hero','is_purchasable','name','pack_count','price','servings','size','sku','slug','stock','subcategory','updated_at','variant_group','weight_grams'];
  got text[]; missing text[]; extra text[]; bad text;
BEGIN
  -- 1. kolom products sama dengan Lovable
  SELECT array_agg(column_name::text ORDER BY column_name) INTO got FROM information_schema.columns WHERE table_schema='public' AND table_name='products';
  SELECT array_agg(x ORDER BY x) INTO missing FROM unnest(live_cols) x WHERE x <> ALL(got);
  SELECT array_agg(x ORDER BY x) INTO extra FROM unnest(got) x WHERE x <> ALL(live_cols);
  INSERT INTO r VALUES ('kolom products = Lovable (30)', missing IS NULL AND extra IS NULL, coalesce('hilang='||missing::text,'')||coalesce(' lebih='||extra::text,''));
  -- 2. hak SELECT per kolom: anon 28 kolom tanpa hpp; authenticated = anon + publish_issue
  SELECT array_agg(column_name::text ORDER BY column_name) INTO got FROM information_schema.role_column_grants WHERE table_schema='public' AND table_name='products' AND grantee='anon' AND privilege_type='SELECT';
  INSERT INTO r VALUES ('anon SELECT kolom = Lovable (tanpa hpp)', got = (SELECT array_agg(x ORDER BY x) FROM unnest(anon_sel) x), coalesce(got::text,'kosong'));
  SELECT array_agg(column_name::text ORDER BY column_name) INTO got FROM information_schema.role_column_grants WHERE table_schema='public' AND table_name='products' AND grantee='authenticated' AND privilege_type='SELECT';
  INSERT INTO r VALUES ('authenticated SELECT kolom = Lovable (tanpa hpp)', got = (SELECT array_agg(x ORDER BY x) FROM unnest(anon_sel || ARRAY['publish_issue']) x), coalesce(got::text,'kosong'));
  -- 3. tidak ada hak tabel-penuh SELECT/INSERT/UPDATE untuk anon/authenticated
  INSERT INTO r VALUES ('tanpa hak SELECT/INSERT/UPDATE tabel-penuh (anon, authenticated)',
    NOT (has_table_privilege('anon','public.products','SELECT') OR has_table_privilege('anon','public.products','INSERT') OR has_table_privilege('anon','public.products','UPDATE')
      OR has_table_privilege('authenticated','public.products','SELECT') OR has_table_privilege('authenticated','public.products','INSERT') OR has_table_privilege('authenticated','public.products','UPDATE')), '');
  -- 4. RLS aktif di semua tabel public
  SELECT string_agg(relname, ',') INTO bad FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  INSERT INTO r VALUES ('RLS aktif di semua tabel public', bad IS NULL, coalesce('tanpa RLS: '||bad,''));
  -- 5. kebijakan & trigger products
  INSERT INTO r VALUES ('products: 5 kebijakan RLS', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='products')=5, (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='products'));
  INSERT INTO r VALUES ('products: trigger guard + activity', (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.products'::regclass AND NOT tgisinternal)=2, '');
  -- 6. fungsi HPP tidak bisa dipanggil anon
  INSERT INTO r VALUES ('anon tidak boleh EXECUTE admin_get_product_hpp', NOT has_function_privilege('anon','public.admin_get_product_hpp(uuid[])','EXECUTE'), '');
  -- 7. FITLIFE10 persis & bucket foto
  INSERT INTO r VALUES ('FITLIFE10 31 Okt 16:00Z s/d 1 Des 15:59:59Z, 10%, fitlife',
    EXISTS (SELECT 1 FROM public.promos WHERE code='FITLIFE10' AND starts_at='2026-10-31T16:00:00Z' AND ends_at='2026-12-01T15:59:59Z' AND value=10 AND lower(brand)='fitlife' AND is_active), '');
  INSERT INTO r VALUES ('bucket product-images privat 5MB', EXISTS (SELECT 1 FROM storage.buckets WHERE id='product-images' AND NOT public AND file_size_limit=5242880), '');
END $$;

-- 8. uji perilaku nyata sebagai peran
INSERT INTO public.products (sku,name,brand,category,subcategory,price,hpp,stock,slug) VALUES ('T-1','Uji','Fitlife','Vitamin','C',100000,60000,5,'uji');
GRANT SELECT ON r TO anon, authenticated;
DO $$ BEGIN
  SET LOCAL ROLE anon;
  BEGIN PERFORM hpp FROM public.products; INSERT INTO pg_temp.r VALUES ('anon: SELECT hpp DITOLAK', false, 'tidak ditolak!');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO pg_temp.r VALUES ('anon: SELECT hpp DITOLAK', true, 'ERROR 42501'); END;
  BEGIN PERFORM * FROM public.products; INSERT INTO pg_temp.r VALUES ('anon: SELECT * DITOLAK (menyentuh hpp)', false, 'tidak ditolak!');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO pg_temp.r VALUES ('anon: SELECT * DITOLAK (menyentuh hpp)', true, 'ERROR 42501'); END;
  PERFORM price FROM public.products WHERE is_active AND NOT is_blocked;
  INSERT INTO pg_temp.r VALUES ('anon: SELECT price (produk aktif) BERHASIL', true, '');
  RESET ROLE;
END $$;
DO $$ BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM hpp FROM public.products; INSERT INTO pg_temp.r VALUES ('authenticated: SELECT hpp DITOLAK', false, 'tidak ditolak!');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO pg_temp.r VALUES ('authenticated: SELECT hpp DITOLAK', true, 'ERROR 42501'); END;
  RESET ROLE;
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
