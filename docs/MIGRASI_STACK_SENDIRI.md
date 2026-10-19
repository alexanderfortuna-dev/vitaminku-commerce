# Migrasi VitaminKu: Lovable → GitHub + Supabase + Vercel milik sendiri

Status per 2026-10-12. Situs Lovable (vitaminku.lovable.app) tetap hidup sampai pemilik menulis **"alihkan"**.
Tidak ada kunci/sandi di dokumen ini; semua nilai rahasia diisi pemilik di dashboard masing-masing.

## STATUS TERKINI (2026-10-12)
- **Supabase baru SUDAH dibuat**: proyek `vitaminku` (ref `vmhoohfwjtsojgcvopaf`, Singapore). Alamat: `https://vmhoohfwjtsojgcvopaf.supabase.co`.
  Kunci publik (aman dipakai di `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY`): ambil dari Supabase → Project Settings → API (jangan salin service_role ke mana pun selain Vercel).
- **Skema terpasang** (urutan sama dengan file gabungan) + pengerasan 0009. Terverifikasi: hpp ditolak untuk anon & authenticated (ERROR 42501), RLS aktif di semua tabel public, FITLIFE10 tepat.
- **Data termuat & terverifikasi** terhadap Lovable (sidik jari md5 identik): 1.461 produk, 1.413 aktif + 48 draf, 553 HPP, total harga 526.262.700, total stok 3.579, 31 foto (CDN Shopee), 2 cabang, 1 promo, 21 kata blokir. Orders 0 (tidak dimuat).
- **Belum**: (1) dua fungsi berisi perintah hapus — tempel `supabase/arsip/PENDING_functions_with_delete.sql` di SQL Editor (sekali); (2) Vercel + variabel lingkungan; (3) akun owner (SQL di bawah); (4) kunci AI untuk Vita; (5) izin jaringan agar Claude bisa menguji preview.

## T1 — (SELESAI) Buat proyek Supabase (pemilik, ±5 menit)
1. supabase.com → **New project** (organisasi Anda).
2. Nama: `vitaminku`. Region: **Southeast Asia (Singapore)**. Buat sandi database → simpan di password manager (jangan ditempel ke chat).
3. Tunggu status *Healthy*.
4. **SQL Editor → New query** → buka file `supabase/arsip/ALL_MIGRATIONS_FOR_NEW_PROJECT.sql` di GitHub (tombol *Raw* → salin semua) → tempel → **Run**. Harus selesai tanpa error merah.
5. **Project Settings → API**: catat *Project URL*, *anon/publishable key*, *service_role key* (tiga nilai ini hanya untuk Vercel, langkah T4).
6. Beri tahu saya "Supabase siap" + hanya **Project URL** (bukan kunci). Saya lalu menjalankan pemeriksaan hpp.

Catatan: migrasi 0000–0008 saja TIDAK cukup — tabel `products` tidak pernah dibuat oleh migrasi mana pun
(dulu dibuat langsung di Lovable). Karena itu ada `supabase/arsip/migrasi-awal/20260908000000_baseline_products.sql`
dan `…000001_storage_product_images.sql`. Hasil uji di Postgres 16 lokal: `bash test/db/run.sh` (14/14 lulus).

## Variabel lingkungan (isi di Vercel → Settings → Environment Variables; hanya NAMA di sini)
| Nama | Wajib | Catatan |
|---|---|---|
| SUPABASE_URL, VITE_SUPABASE_URL | ya | Project URL |
| SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY | ya | anon/publishable key (publik) |
| SUPABASE_SERVICE_ROLE_KEY | ya | RAHASIA, tanpa awalan VITE_ |
| ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_SECRET | opsional | alternatif aktivasi owner (lihat T6) |
| AI_API_KEY (+ AI_BASE_URL, AI_MODEL) | opsional | tanpa ini asisten Vita menampilkan "sedang tidak tersedia" |
| PUBLIC_SITE_URL | opsional | URL toko untuk tautan di alat MCP |
| MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, MIDTRANS_IS_PRODUCTION | nanti | jangan isi kunci LIVE sebelum disetujui |
| BITESHIP_API_KEY, SHIPPING_ORIGIN_POSTAL_CODE | nanti | ongkir |

## T2 — Muat data (menunggu export)
Sumber: `data/seed/*.json|csv` (BELUM ada; folder ini di-gitignore karena memuat HPP). Minta export dari sesi Lovable-MCP:
products (1.461 baris), store_branches, store_settings, promos, product_blocklist, product_blocked_skus.
Jangan muat `orders` (0 baris). Verifikasi terhadap manifest: jumlah baris, sum(price), count(hpp not null), count(is_active), 48 draf nonaktif, jendela FITLIFE10.

## T4 — Vercel (pemilik)
1. vercel.com → **Add New → Project** → impor `alexanderfortuna-dev/vitaminku-commerce`, branch `feat/own-stack-v2`.
2. Framework: **Other**. Install/Build sudah diatur `vercel.json` (`bun install --frozen-lockfile`, `bun run build:vercel`).
3. Isi variabel di atas → **Deploy**. Hasilnya URL *Preview* (`*.vercel.app`); JANGAN pasang domain produksi.

## T6 — Jadikan Anda owner (jalankan SENDIRI di Supabase SQL Editor)
Langkah: buka URL preview → `/admin/login` → daftar/masuk dengan email Anda sekali, lalu jalankan:
```sql
insert into public.user_roles (user_id, role, is_active)
select id, 'owner', true from auth.users where email = 'GANTI_DENGAN_EMAIL_ANDA'
on conflict (user_id) do update set role = 'owner', is_active = true;
select u.email, r.role, r.is_active from public.user_roles r join auth.users u on u.id = r.user_id;
```
Hasil akhir harus 1 baris: email Anda · owner · true.

## T7 — Paket alih domain (JANGAN dijalankan sebelum "alihkan")
1. Beli domain sendiri (keputusan Anda). Di Vercel → Domains → tambahkan; ikuti rekaman DNS yang ditampilkan Vercel
   (biasanya `A 76.76.21.21` untuk apex, `CNAME cname.vercel-dns.com` untuk www) di registrar domain.
2. **Sinkron data terakhir** tepat sebelum alih: Anda berhenti mengedit di Lovable → saya ekspor ulang products/promos/settings dari Lovable → muat ulang ke Supabase baru → cocokkan jumlah & sum(price).
3. Supabase Auth → URL Configuration: Site URL & Redirect URL = domain baru.
4. Midtrans: URL notifikasi → `https://DOMAIN/api/public/midtrans/notification` (kunci LIVE hanya setelah izin Anda).
5. **Rollback**: arahkan DNS kembali; situs Lovable tidak diubah selama proses.

## Pemeriksaan hpp di proyek baru (PowerShell, satu blok)
```powershell
$u = "https://GANTI_REF.supabase.co/rest/v1/products?select=hpp&limit=1"
$k = Read-Host "Tempel anon/publishable key (publik)"
try { Invoke-RestMethod -Uri $u -Headers @{ apikey = $k; Authorization = "Bearer $k" } ; "GAGAL: hpp terbaca!" }
catch { "OK ditolak: " + $_.Exception.Response.StatusCode }
```
Yang benar: pesan **OK ditolak** (401/403).

## Hal yang harus dibereskan setelah pindah
- Token Storefront Shopify lama pernah tertulis di kode (riwayat git `main`): rotasi/cabut di Shopify bila akun itu masih aktif.
- `@lovable.dev/vite-tanstack-config` dan `@lovable.dev/mcp-js` masih dipakai sebagai alat build/MCP (paket npm publik; tidak menghubungi server Lovable saat toko berjalan).
