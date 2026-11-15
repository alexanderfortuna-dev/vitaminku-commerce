-- Clenbuterol dan zat yang baru masuk blocklist harus diblokir.
-- Dukungan alami (tongkat ali) tidak diblokir: itu keputusan owner, bukan katalog.
CREATE TEMP TABLE r(name text, ok boolean, detail text);
GRANT ALL ON r TO PUBLIC;

INSERT INTO public.products(sku,name,brand,category,subcategory,price,stock,slug,is_active)
VALUES ('BL-CLEN','Clenbuterol 40mcg','Uji','Sports','Uji',10000,5,'bl-clen',true);

INSERT INTO public.products(sku,name,brand,category,subcategory,price,stock,slug,is_active,weight_grams,images)
VALUES ('BL-TONGKAT','Tongkat Ali 400mg','Uji','Sports','Uji',10000,5,'bl-tongkat',true,200,ARRAY['https://example.test/a.jpg']);

INSERT INTO r
SELECT 'Clenbuterol 40mcg diblokir dan nonaktif',
       is_blocked AND NOT is_active AND blocked_reason IS NOT NULL,
       coalesce(blocked_reason, 'tidak diblokir')
FROM public.products WHERE sku = 'BL-CLEN';

INSERT INTO r
SELECT 'Tongkat Ali tidak ikut diblokir katalog',
       NOT is_blocked,
       coalesce(blocked_reason, '')
FROM public.products WHERE sku = 'BL-TONGKAT';

DO $$ DECLARE seen int; BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO seen FROM public.products WHERE sku = 'BL-CLEN';
  RESET ROLE;
  INSERT INTO pg_temp.r VALUES ('anon tidak melihat Clenbuterol', seen = 0, seen::text);
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE detail END AS detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
