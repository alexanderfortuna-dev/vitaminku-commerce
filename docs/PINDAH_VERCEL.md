# Pindah ke Vercel + Supabase milik sendiri (urutan; centang satu per satu)

1. **Supabase baru (vmhoohfwjtsojgcvopaf)** → SQL Editor → tempel seluruh isi `supabase/APPLY_0010_0013.sql` → Run. (Satu kali, aman diulang.)
2. **Supabase → Authentication → Providers → Email**: aktifkan *Enable Email provider* dan *Confirm email*; magic link/OTP nyala.
   **Authentication → URL Configuration**: *Site URL* = alamat Vercel Anda; *Redirect URLs* tambah `https://ALAMAT-ANDA/masuk`.
   (Google opsional: Providers → Google → Enable; lalu di Vercel set `VITE_GOOGLE_LOGIN=true`. Kunci Google Anda isi sendiri di Supabase, jangan kirim ke chat.)
3. **Vercel → Add New Project** → pilih repo `vitaminku-commerce`, branch `main` setelah PR digabung. Framework: biarkan. Build Command: `bun run build:vercel`. Install: `bun install --frozen-lockfile`.
4. **Vercel → Settings → Environment Variables** (nama persis; nilai dari Supabase → Project Settings → API):
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (rahasia), `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` (untuk Vita), `SITE_URL` dan `VITE_SITE_URL` (alamat situs).
   Opsional nanti: `MIDTRANS_*`, `BITESHIP_API_KEY`.
5. Deploy. Buka situs, coba katalog, keranjang, checkout.
6. Login admin pertama: buka `/masuk`, minta tautan email (Kings dan Livita). Setelah keduanya masuk sekali, jalankan `supabase/BOOTSTRAP_OWNER.sql` (ganti `{{KINGS_EMAIL}}` dan `{{LIVITA_EMAIL}}`).
7. **Akses untuk pengisi gambar**: login sebagai Owner → `/admin/pengguna` → undang email orangnya dengan peran **Tim Produk** (hanya produk & foto; tanpa harga pokok, tanpa pengguna, tanpa uang).
8. Domain/DNS dan pembelian: tanyakan Kings dulu (tidak dilakukan otomatis).
9. Setelah situs baru dipastikan jalan, baru matikan ketergantungan ke Lovable (jangan hapus dulu; simpan sebagai cadangan 1–2 minggu).
