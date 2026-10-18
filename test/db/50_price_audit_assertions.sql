-- Setiap perubahan harga lewat impor menulis satu baris admin_audit_log (trigger products_activity_log). Postgres 16 LOKAL.
CREATE TEMP TABLE r(name text, ok boolean, detail text);
INSERT INTO public.products(sku,name,brand,category,subcategory,price,stock,slug,is_active,weight_grams,images)
  SELECT 'PA-'||g, 'Audit '||g, 'Uji','Vitamin','Uji', 50000, 3, 'pa-'||g, true, 200, ARRAY['https://example.test/'||g||'.jpg'] FROM generate_series(1,20) g;
CREATE TEMP TABLE base AS SELECT count(*) AS n FROM public.admin_audit_log WHERE action='product_change';
-- 18 baris valid diterapkan (seperti applyPriceStockImport: satu UPDATE per produk); 2 baris rusak tidak disentuh.
UPDATE public.products SET price = 60000 + (substr(sku,4))::int WHERE sku IN (SELECT 'PA-'||g FROM generate_series(1,20) g WHERE g NOT IN (5,10));
INSERT INTO r SELECT '18 harga berubah', (SELECT count(*) FROM public.products WHERE sku LIKE 'PA-%' AND price <> 50000) = 18, '';
INSERT INTO r SELECT '2 baris rusak tidak berubah', (SELECT count(*) FROM public.products WHERE sku IN ('PA-5','PA-10') AND price = 50000) = 2, '';
INSERT INTO r SELECT '18 baris audit product_change (harga lama -> baru)',
  (SELECT count(*) FROM public.admin_audit_log WHERE action='product_change' AND payload ? 'harga' AND payload->>'sku' LIKE 'PA-%') = 18
  AND (SELECT count(*) FROM public.admin_audit_log WHERE action='product_change') = (SELECT n FROM base) + 18, '';
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE detail END AS detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
