-- cek-database.sql — HANYA BACA (SELECT). Proyek vmhoohfwjtsojgcvopaf. Satu baris per pemeriksaan: cek | hasil | detail.
-- hasil: LULUS / GAGAL / INFO. Tidak pernah menampilkan HPP atau data pribadi.
WITH t AS (
  SELECT count(*) AS n FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('customers','branch_admins','product_imports','product_import_rows')
), f AS (
  SELECT count(DISTINCT p.proname) AS n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
  WHERE s.nspname = 'public' AND p.proname IN
    ('has_permission','public_branch_contacts','staff_set_order_stage','undo_product_import','owner_remove_block','chat_rate_hit')
), g AS (
  SELECT count(*) AS n FROM pg_trigger WHERE tgname = 'user_roles_protect_trg' AND NOT tgisinternal
), r AS (
  SELECT count(*) FILTER (WHERE c.relrowsecurity) AS on_, count(*) AS total
  FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
  WHERE s.nspname = 'public' AND c.relname IN ('customers','branch_admins','product_imports','product_import_rows')
), h AS (
  SELECT has_column_privilege('anon', 'public.products', 'hpp', 'SELECT') AS anon_hpp,
         has_column_privilege('authenticated', 'public.products', 'hpp', 'SELECT') AS auth_hpp
), p AS (
  SELECT count(*) AS n FROM public.products
), o AS (
  SELECT count(*) AS n FROM public.user_roles WHERE role = 'owner' AND is_active
), co AS (
  SELECT to_regprocedure('public.create_order(jsonb,text)') IS NOT NULL AS ada,
         NOT has_table_privilege('anon', 'public.orders', 'INSERT') AS anon_tertutup
), sp AS (
  SELECT to_regclass('public.shopee_photo_candidates') IS NOT NULL AS ada
)
SELECT '1. Tabel baru (4)' AS cek, CASE WHEN t.n = 4 THEN 'LULUS' ELSE 'GAGAL' END AS hasil, t.n || ' dari 4' AS detail FROM t
UNION ALL SELECT '2. Fungsi baru (6)', CASE WHEN f.n = 6 THEN 'LULUS' ELSE 'GAGAL' END, f.n || ' dari 6' FROM f
UNION ALL SELECT '3. Pengaman owner terakhir', CASE WHEN g.n = 1 THEN 'LULUS' ELSE 'GAGAL' END, CASE WHEN g.n = 1 THEN 'aktif' ELSE 'belum ada' END FROM g
UNION ALL SELECT '4. RLS tabel baru', CASE WHEN r.total = 4 AND r.on_ = 4 THEN 'LULUS' ELSE 'GAGAL' END, r.on_ || ' dari 4 terkunci' FROM r
UNION ALL SELECT '5. HPP tertutup untuk publik', CASE WHEN NOT h.anon_hpp AND NOT h.auth_hpp THEN 'LULUS' ELSE 'GAGAL' END,
  CASE WHEN NOT h.anon_hpp AND NOT h.auth_hpp THEN 'tamu & pelanggan tidak bisa baca' ELSE 'TERBUKA — hentikan dan lapor' END FROM h
UNION ALL SELECT '6. Jumlah produk', CASE WHEN p.n > 0 THEN 'LULUS' ELSE 'GAGAL' END, p.n || ' produk' FROM p
UNION ALL SELECT '7. Owner aktif', CASE WHEN o.n >= 1 THEN 'LULUS' ELSE 'INFO' END,
  o.n || ' owner' || CASE WHEN o.n = 0 THEN ' (normal sebelum mode aktifkan-peran)' ELSE '' END FROM o
UNION ALL SELECT '8. Pesanan lewat create_order', CASE WHEN co.ada AND co.anon_tertutup THEN 'LULUS' ELSE 'GAGAL' END,
  CASE WHEN NOT co.ada THEN 'fungsi belum ada' WHEN NOT co.anon_tertutup THEN 'tamu masih bisa menulis langsung' ELSE 'tercatat aman' END FROM co
UNION ALL SELECT '9. Antrean tinjau foto Shopee', CASE WHEN sp.ada THEN 'LULUS' ELSE 'GAGAL' END, CASE WHEN sp.ada THEN 'siap' ELSE 'belum ada' END FROM sp
-- Cakupan data ongkir (INFO, bukan syarat lulus): produk yang bisa dibeli = aktif, tidak diblokir, berharga.
UNION ALL SELECT '10. Data ongkir: berat', 'INFO',
  (SELECT count(*) FILTER (WHERE weight_grams > 0) || ' dari ' || count(*) || ' produk bisa-dibeli punya berat ('
    || coalesce(round(100.0 * count(*) FILTER (WHERE weight_grams > 0) / nullif(count(*), 0), 1)::text, '0') || '%); sisanya dihitung 500 g cadangan'
   FROM public.products WHERE is_active AND NOT is_blocked AND price > 0)
UNION ALL SELECT '11. Data ongkir: ukuran', 'INFO',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'length_cm')
    THEN (xpath('/row/n/text()', query_to_xml(
      'SELECT count(*) FILTER (WHERE length_cm > 0 AND width_cm > 0 AND height_cm > 0) || '' dari '' || count(*) || '' produk bisa-dibeli punya ukuran lengkap''
         AS n FROM public.products WHERE is_active AND NOT is_blocked AND price > 0', false, true, '')))[1]::text
    ELSE 'kolom ukuran belum ada (migrasi 0018 belum dipasang)' END
UNION ALL SELECT '12. Vita cerdas (migrasi 0017)', 'INFO',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'vita_search')
        AND to_regclass('public.vita_events') IS NOT NULL
       THEN 'terpasang: pencarian vita_search dan tabel statistik ada' ELSE 'belum terpasang' END
UNION ALL SELECT '13. Ongkir & link bayar (migrasi 0018)', 'INFO',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'staff_set_shipping')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_branches' AND column_name = 'instant_delivery')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_link_at')
       THEN 'terpasang: fungsi ongkir staf, kolom cabang, dan kolom link bayar ada' ELSE 'belum terpasang' END;
