-- Uji asap produksi VitaminKu (dipakai mode cek-saja). Semua di dalam SATU transaksi yang selalu di-ROLLBACK:
-- tidak ada data tersimpan, stok tidak berubah, tidak ada pesan terkirim (database tidak punya pemanggil keluar).
-- Keluaran: cek|LULUS/GAGAL|detail (sama seperti cek-database.sql). Hasil dikumpulkan lewat set_config (bisa dipakai peran apa pun).
BEGIN;

-- A. Sebagai pengunjung tanpa login (anon).
SET LOCAL ROLE anon;
DO $$
DECLARE n int; b int; ban int;
BEGIN
  BEGIN PERFORM hpp FROM public.products LIMIT 1; PERFORM set_config('uji.hpp', 'GAGAL|HPP terbaca pengunjung', true);
  EXCEPTION WHEN insufficient_privilege OR undefined_column THEN PERFORM set_config('uji.hpp', 'LULUS|HPP ditolak untuk pengunjung', true); END;

  BEGIN SELECT count(*) INTO n FROM public.orders;
    PERFORM set_config('uji.orders', CASE WHEN n = 0 THEN 'LULUS|0 pesanan terlihat' ELSE 'GAGAL|' || n || ' pesanan terlihat' END, true);
  EXCEPTION WHEN insufficient_privilege THEN PERFORM set_config('uji.orders', 'LULUS|baca pesanan ditolak', true); END;

  BEGIN INSERT INTO public.orders (order_number) VALUES ('UJI-ANON'); PERFORM set_config('uji.tulis', 'GAGAL|pengunjung bisa menulis pesanan', true);
  EXCEPTION WHEN insufficient_privilege OR not_null_violation OR check_violation THEN
    PERFORM set_config('uji.tulis', CASE WHEN SQLSTATE = '42501' THEN 'LULUS|tulis langsung ditolak' ELSE 'GAGAL|tulis tidak ditolak hak akses (' || SQLSTATE || ')' END, true); END;

  BEGIN PERFORM public.create_order('{}'::jsonb, 'uji-asap-anon-000000'); PERFORM set_config('uji.rpc', 'GAGAL|create_order terbuka untuk pengunjung', true);
  EXCEPTION WHEN insufficient_privilege THEN PERFORM set_config('uji.rpc', 'LULUS|create_order hanya server', true);
  WHEN OTHERS THEN PERFORM set_config('uji.rpc', 'GAGAL|create_order terpanggil (' || SQLSTATE || ')', true); END;

  BEGIN PERFORM public.get_order_by_token(repeat('a', 48)); PERFORM set_config('uji.token', 'GAGAL|get_order_by_token terbuka', true);
  EXCEPTION WHEN insufficient_privilege THEN PERFORM set_config('uji.token', 'LULUS|cek pesanan hanya lewat server', true); END;

  BEGIN PERFORM 1 FROM public.shopee_photo_candidates LIMIT 1; PERFORM set_config('uji.foto', 'GAGAL|antrean foto terbaca', true);
  EXCEPTION WHEN insufficient_privilege THEN PERFORM set_config('uji.foto', 'LULUS|antrean foto tertutup', true); END;

  SELECT count(*), count(*) FILTER (WHERE is_blocked),
         count(*) FILTER (WHERE name ~* '(yohimbe|modafinil|\mdhea\M|\msarms?\M|ostarine|ligandrol|cardarine)')
    INTO n, b, ban FROM public.products;
  PERFORM set_config('uji.katalog', CASE WHEN n > 0 THEN 'LULUS|' ELSE 'GAGAL|' END || n || ' produk terlihat pengunjung', true);
  PERFORM set_config('uji.terlarang', CASE WHEN b = 0 AND ban = 0 THEN 'LULUS|' ELSE 'GAGAL|' END
    || b || ' terblokir, ' || ban || ' nama terlarang terlihat', true);
END $$;
RESET ROLE;

-- B. Produk terlarang baru otomatis diblokir database (baris uji hilang saat ROLLBACK).
DO $$
DECLARE blk boolean; vis int;
BEGIN
  INSERT INTO public.products (sku, name, brand, category, subcategory, price, stock, slug, is_active)
    VALUES ('UJI-ASAP-BL', 'Yohimbe Uji Asap', 'Uji', 'Uji', 'Uji', 10000, 5, 'uji-asap-yohimbe', true)
    RETURNING is_blocked INTO blk;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO vis FROM public.products WHERE slug = 'uji-asap-yohimbe';
  RESET ROLE;
  PERFORM set_config('uji.blokir', CASE WHEN blk AND vis = 0 THEN 'LULUS|produk Yohimbe baru otomatis diblokir & tersembunyi'
    ELSE 'GAGAL|diblokir=' || coalesce(blk::text, '?') || ', terlihat=' || vis END, true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('uji.blokir', 'GAGAL|uji blokir error ' || SQLSTATE, true);
END $$;

-- C. Pesanan uji lewat jalur server (service_role): harga palsu diabaikan, idempoten, stok tidak berubah.
SET LOCAL ROLE service_role;
DO $$
DECLARE p record; r1 jsonb; r2 jsonb; s_after int; key text := 'uji-asap-' || replace(gen_random_uuid()::text, '-', '');
  pl jsonb;
BEGIN
  SELECT id, slug, round(price)::bigint AS price, stock INTO p FROM public.products
   WHERE is_active AND NOT is_blocked AND price > 0 AND stock >= 1 ORDER BY slug LIMIT 1;
  IF NOT FOUND THEN PERFORM set_config('uji.harga', 'GAGAL|tidak ada produk berharga & berstok untuk diuji', true); RETURN; END IF;
  pl := jsonb_build_object(
    'lines', jsonb_build_array(jsonb_build_object('slug', p.slug, 'quantity', 1, 'price', 1, 'unit_price', 1)),
    'customer', jsonb_build_object('name', 'Uji Asap', 'whatsapp', '6280000000000', 'address', 'Alamat uji asap, tidak dikirim'),
    'subtotal', 1, 'total', 1, 'payment_mode', 'whatsapp');
  r1 := public.create_order(pl, key);
  r2 := public.create_order(pl, key);
  SELECT stock INTO s_after FROM public.products WHERE id = p.id;
  PERFORM set_config('uji.harga', CASE WHEN (r1->>'total')::bigint = p.price THEN 'LULUS|harga palsu Rp1 diabaikan, total = harga database'
    ELSE 'GAGAL|total ' || coalesce(r1->>'total', '?') || ' ≠ harga ' || p.price END, true);
  PERFORM set_config('uji.pesanan', CASE WHEN r1->>'status' = 'menunggu_konfirmasi' AND s_after = p.stock
      AND (r1->>'order_number') = (r2->>'order_number')
    THEN 'LULUS|pesanan uji dibuat (menunggu konfirmasi), idempoten, stok tetap, lalu dibatalkan (rollback)'
    ELSE 'GAGAL|status=' || coalesce(r1->>'status', '?') || ' stok ' || p.stock || '→' || s_after END, true);
  BEGIN
    PERFORM public.create_order(jsonb_set(pl, '{discount_total}', to_jsonb(p.price + 1)), key || 'd');
    PERFORM set_config('uji.diskon', 'GAGAL|diskon melebihi harga diterima', true);
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM set_config('uji.diskon', 'LULUS|diskon palsu ditolak', true); END;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('uji.harga', 'GAGAL|pesanan uji error ' || SQLSTATE || ' ' || left(SQLERRM, 60), true);
END $$;
RESET ROLE;

SELECT 'U' || i || ' ' || label || '|' || coalesce(nullif(current_setting('uji.' || k, true), ''), 'GAGAL|tidak terukur')
FROM (VALUES (1, 'HPP tertutup', 'hpp'), (2, 'pesanan orang lain', 'orders'), (3, 'tulis pesanan langsung', 'tulis'),
             (4, 'create_order', 'rpc'), (5, 'cek pesanan via token', 'token'), (6, 'antrean foto', 'foto'),
             (7, 'katalog tampil', 'katalog'), (8, 'produk terlarang', 'terlarang'), (9, 'blokir otomatis', 'blokir'),
             (10, 'harga dari database', 'harga'), (11, 'pesanan uji', 'pesanan'), (12, 'diskon palsu', 'diskon')) t(i, label, k)
ORDER BY i;

ROLLBACK;
