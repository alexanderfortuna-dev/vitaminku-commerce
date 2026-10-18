# Akses Owner ke Seller Center (sekali jalan)

Tidak ada email di repo. Email Anda hanya diketik di SQL di bawah, di Supabase SQL Editor.

1. Buka situs → `/masuk` → masukkan email Anda → klik tautan di email (login tanpa sandi). Ini membuat akun Anda.
2. Buka Supabase → proyek **vitaminku** → SQL Editor → tempel, ganti `EMAIL_ANDA`, lalu Run:

```sql
INSERT INTO public.user_roles (user_id, role, is_active)
SELECT id, 'owner', true FROM auth.users
WHERE lower(email) = lower('EMAIL_ANDA') AND email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET role = 'owner', is_active = true;
```

3. Hasil harus "Success. 1 row affected". Buka `/admin` (atau `/seller`).
   - 0 row = email salah ketik atau belum klik tautan di langkah 1.
4. Untuk Co-Owner / General Manager: mereka login dulu, lalu undang peran dari halaman **Pengguna** di admin.

Urutan produksi: terapkan migrasi (GitHub Actions "VitaminKu DB" mode `migrate`) SEBELUM deploy situs.
