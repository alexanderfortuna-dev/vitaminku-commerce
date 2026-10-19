-- BOOTSTRAP OWNER — hanya proyek vmhoohfwjtsojgcvopaf. Dijalankan lewat GitHub Actions "VitaminKu DB" mode bootstrap
-- (tombol oleh Kings), atau psql dengan variabel:
--   psql "$SUPABASE_DB_URL" -v kings_email=... -v livita_email=... -v admin_email=... --single-transaction -f supabase/operasi/aktifkan-peran.sql
-- Variabel kosong ('') dilewati dengan aman. Hanya akun yang emailnya SUDAH terverifikasi (sudah login sekali) yang diberi peran.
-- Label jabatan owner disimpan di display_name ("Owner"/"Co-Owner"); kolom title hanya untuk Manajer (general_manager/admin).
-- Manajer TIDAK bisa: penarikan/pencairan uang, kunci pembayaran, ubah peran, ekspor HPP/pelanggan, hapus pesanan (dijaga database).

INSERT INTO public.user_roles (user_id, role, is_active, display_name)
SELECT u.id, 'owner'::public.app_role, true, x.label
FROM (VALUES (nullif(btrim(:'kings_email'), ''), 'Owner'), (nullif(btrim(:'livita_email'), ''), 'Co-Owner')) AS x(email, label)
JOIN auth.users u ON lower(u.email) = lower(x.email)
WHERE x.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET role = 'owner', is_active = true, display_name = EXCLUDED.display_name, updated_at = now();

INSERT INTO public.user_roles (user_id, role, is_active, title, display_name)
SELECT u.id, 'admin'::public.app_role, true, 'general_manager', 'General Manager'
FROM auth.users u
WHERE nullif(btrim(:'admin_email'), '') IS NOT NULL
  AND lower(u.email) = lower(btrim(:'admin_email')) AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', is_active = true, title = 'general_manager',
  display_name = 'General Manager', updated_at = now();

-- Ringkasan tanpa email lengkap (aman untuk log).
SELECT coalesce(ur.display_name, ur.role::text) AS jabatan, ur.role::text AS peran,
       left(u.email, 1) || '***@' || split_part(u.email, '@', 2) AS email_tersamar, ur.is_active AS aktif
FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role IN ('owner','admin') ORDER BY ur.role, jabatan;

-- Rollback bila salah orang: UPDATE public.user_roles SET role='seller', is_active=false WHERE user_id = '<uuid>';
--   (database menolak bila itu owner aktif terakhir — sengaja.)
