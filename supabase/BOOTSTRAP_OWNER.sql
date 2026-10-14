-- BOOTSTRAP OWNER — JANGAN dijalankan otomatis. Hanya untuk proyek Supabase vmhoohfwjtsojgcvopaf, dijalankan SEKALI oleh Kings.
-- Prasyarat: (1) PASTE_SEKALI.sql sudah dijalankan; (2) Kings DAN Livita sudah login sekali lewat /masuk dengan email terverifikasi.
-- WAJIB ganti baris "ISI EMAIL LIVITA" di bawah dengan email Livita yang asli sebelum Run. Jangan menaruh sandi/kunci di sini.
INSERT INTO public.user_roles (user_id, role, is_active)
SELECT u.id, 'owner'::public.app_role, true
FROM auth.users u
WHERE lower(u.email) IN (lower('alexander.fortuna@vitafortunajaya.com'), lower('ISI EMAIL LIVITA'))
  AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET role = 'owner', is_active = true, updated_at = now();

-- General Manager (peran Manajer, jabatan General Manager). Ganti "ISI EMAIL ADMIN" dulu; orang ini harus sudah login sekali.
-- Manajer TIDAK bisa: penarikan/pencairan uang, kunci pembayaran, ubah peran, ekspor HPP/pelanggan, hapus pesanan (dijaga database).
INSERT INTO public.user_roles (user_id, role, is_active, title)
SELECT u.id, 'admin'::public.app_role, true, 'general_manager'
FROM auth.users u
WHERE lower(u.email) = lower('ISI EMAIL ADMIN') AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', is_active = true, title = 'general_manager', updated_at = now();

-- Periksa: harus tepat 2 baris owner aktif (Kings & Livita); GM tampil di query terpisah. Bila hanya 1, Livita belum login / email salah ketik.
SELECT u.email, ur.role, ur.is_active
FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'owner' ORDER BY u.email;

-- Rollback bila salah orang: UPDATE public.user_roles SET role='seller', is_active=false WHERE user_id = '<uuid>';
--   (database menolak bila itu owner aktif terakhir — sengaja.)
