# Pindah ke Vercel + Supabase milik sendiri (Kings: maksimal 3 tindakan)

> ⚠️ **JANGAN merge PR #2 ke `main` sebelum situs benar-benar pindah dari Lovable.** `main` tersambung ke situs Lovable yang
> masih hidup; kode baru butuh tabel baru dan bisa membuat situs lama error. Vercel dipasang dari branch `feat/launch-ready-v3`.

## Tindakan 1 — Tempel SQL (± 3 menit, bisa dari HP)
1. GitHub → repo `vitaminku-commerce` → branch `feat/launch-ready-v3` → folder `supabase` → `PASTE_SEKALI.sql` → **Raw** → Select All → Copy.
2. supabase.com → proyek **vmhoohfwjtsojgcvopaf** (bukan "nolimit-system"!) → **SQL Editor → New query** → Paste → **Run** → harus "Success".
3. Aman diulang. Lalu buka `docs/VERIFIKASI_SETELAH_SQL.md` dan jalankan pemeriksaannya (baca-saja).

## Tindakan 2 — Pengaturan Supabase Auth
**Authentication → Providers → Email**: *Enable Email provider* = ON, *Confirm email* = ON (magic link/OTP aktif).
**Authentication → URL Configuration**: *Site URL* = alamat Vercel Anda; *Redirect URLs* tambah `https://ALAMAT-ANDA/masuk`.
Google (opsional): Providers → Google → Enable (isi kunci Google langsung di Supabase, jangan di chat), lalu di Vercel set `VITE_GOOGLE_LOGIN=true`.

## Tindakan 3 — Vercel
1. vercel.com → **Add New → Project** → impor repo `vitaminku-commerce`.
2. **Production Branch = `feat/launch-ready-v3`** (Settings → Git). Bukan `main`.
3. Build Command: `bun run build:vercel` · Install Command: `bun install --frozen-lockfile`.
4. **Settings → Environment Variables** (nama persis; nilai dari Supabase → Project Settings → API; jangan kirim ke chat):

| Nama | Catatan |
|---|---|
| `SUPABASE_URL` | URL proyek |
| `SUPABASE_PUBLISHABLE_KEY` | kunci publik |
| `SUPABASE_SERVICE_ROLE_KEY` | **RAHASIA** — tandai Sensitive |
| `VITE_SUPABASE_URL` | sama dengan URL proyek |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | sama dengan kunci publik |
| `ANTHROPIC_API_KEY` | untuk asisten Vita |
| `SITE_URL`, `VITE_SITE_URL` | alamat situs (tanpa garis miring akhir) |
| opsional: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`, `BITESHIP_API_KEY`, `VITE_GOOGLE_LOGIN` | hanya bila dipakai |

5. Deploy. Lalu jalankan `docs/UJI_ASAP.md`.

## Sesudahnya
- Login pertama Anda dan Livita di `/masuk` (tautan email). Setelah keduanya masuk SEKALI, jalankan `supabase/BOOTSTRAP_OWNER.sql` (isi email Livita dulu).
- Pengisi gambar: `/admin/pengguna` → undang email → peran **Tim Produk**.
- Domain/DNS dan pembelian: tanya Kings dulu. Jangan hapus proyek Lovable selama 1–2 minggu (cadangan).
