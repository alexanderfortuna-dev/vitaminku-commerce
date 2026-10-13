-- BOOTSTRAP OWNER — JANGAN dijalankan otomatis. Dijalankan SEKALI oleh sesi Lovable-MCP / SQL editor milik Kings.
-- Prasyarat: migrasi 0010–0013 sudah diterapkan, dan KEDUA orang sudah masuk (login) minimal sekali sehingga akunnya ada.
-- Ganti dua placeholder di bawah dengan email asli (huruf kecil/besar tidak masalah). Jangan taruh sandi/kunci di sini.
INSERT INTO public.user_roles (user_id, role, is_active)
SELECT u.id, 'owner'::public.app_role, true
FROM auth.users u
WHERE lower(u.email) IN (lower('{{KINGS_EMAIL}}'), lower('{{LIVITA_EMAIL}}'))
  AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET role = 'owner', is_active = true, updated_at = now();

-- Periksa: harus tepat 2 baris owner aktif (Kings & Livita).
SELECT u.email, ur.role, ur.is_active
FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'owner' ORDER BY u.email;

-- Rollback (bila salah orang): UPDATE public.user_roles SET role='seller', is_active=false WHERE user_id = '<uuid>';
--   (database menolak bila itu owner aktif terakhir — sengaja.)
