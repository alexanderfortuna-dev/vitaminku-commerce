-- Asersi DB "produk terlarang" (Postgres 16 LOKAL, bukan Supabase asli).
-- Obat keras, SARMs, modafinil, yohimbe, DHEA: harus otomatis diblokir, tidak tampil ke anon,
-- dan tidak bisa dihidupkan lagi lewat UPDATE. Produk biasa tetap tampil.
CREATE TEMP TABLE r(name text, ok boolean, detail text);
GRANT ALL ON r TO PUBLIC;

INSERT INTO public.products(sku,name,brand,category,subcategory,price,stock,slug,is_active) VALUES
  ('BL-OBAT','Obat keras antibiotik resep dokter','Uji','Kesehatan','Uji',10000,5,'bl-obat',true),
  ('BL-SARM','Ostarine MK-2866 SARMs','Uji','Sports','Uji',10000,5,'bl-sarm',true),
  ('BL-MODA','Modafinil 200mg','Uji','Fokus','Uji',10000,5,'bl-moda',true),
  ('BL-YOHI','Yohimbe Extract','Uji','Sports','Uji',10000,5,'bl-yohi',true),
  ('BL-DHEA','DHEA 50mg','Uji','Hormon','Uji',10000,5,'bl-dhea',true);
-- Aturan publikasi (harga>0, foto, stok>=0, berat>0) berlaku untuk produk Live baru, jadi produk biasa dilengkapi.
INSERT INTO public.products(sku,name,brand,category,subcategory,price,stock,slug,is_active,weight_grams,images)
  VALUES ('BL-OK','Vitamin C 500mg','Uji','Vitamin','Uji',10000,5,'bl-ok',true,200,ARRAY['https://example.test/a.jpg']);

INSERT INTO r
SELECT 'terlarang otomatis diblokir & nonaktif: ' || sku,
       is_blocked AND NOT is_active AND blocked_reason IS NOT NULL, coalesce(blocked_reason, 'tidak diblokir!')
FROM public.products WHERE sku IN ('BL-OBAT','BL-SARM','BL-MODA','BL-YOHI','BL-DHEA');

INSERT INTO r SELECT 'produk biasa tetap aktif', NOT is_blocked AND is_active, '' FROM public.products WHERE sku = 'BL-OK';

DO $$ DECLARE seen int; ok_seen int; BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO seen FROM public.products WHERE sku LIKE 'BL-%' AND sku <> 'BL-OK';
  SELECT count(*) INTO ok_seen FROM public.products WHERE sku = 'BL-OK';
  RESET ROLE;
  INSERT INTO pg_temp.r VALUES ('anon tidak melihat satu pun produk terlarang', seen = 0, seen::text || ' terlihat');
  INSERT INTO pg_temp.r VALUES ('anon melihat produk biasa', ok_seen = 1, ok_seen::text);
END $$;

-- Dihidupkan paksa oleh service/owner pun tetap diblokir (trigger products_guard).
UPDATE public.products SET is_active = true, is_blocked = false WHERE sku = 'BL-SARM';
INSERT INTO r SELECT 'UPDATE paksa aktif tidak membuka blokir SARMs', is_blocked AND NOT is_active, '' FROM public.products WHERE sku = 'BL-SARM';

-- Nama diganti diam-diam tidak membuka blokir selama deskripsi masih menyebut zat terlarang.
UPDATE public.products SET name = 'Suplemen X', description = 'mengandung yohimbine', is_active = true WHERE sku = 'BL-YOHI';
INSERT INTO r SELECT 'ganti nama tidak melewati blokir (deskripsi yohimbine)', is_blocked AND NOT is_active, '' FROM public.products WHERE sku = 'BL-YOHI';

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE detail END AS detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
