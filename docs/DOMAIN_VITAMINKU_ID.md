# Memasang domain www.vitaminku.id

Status 2026-11-16: kedua domain sudah terdaftar di proyek Vercel `vitaminku` dan terverifikasi.
Yang belum: DNS di Domainesia masih kosong, jadi domain belum membuka toko.

## Yang harus pemilik isi di Domainesia (satu kali)

Masuk ke Domainesia, buka DNS Management untuk `vitaminku.id`, lalu buat dua catatan:

| Tipe | Nama / Host | Nilai | Keterangan |
|---|---|---|---|
| CNAME | `www` | `1e292a177dd58110.vercel-dns-016.com` | alamat utama toko |
| A | `@` (kosong / vitaminku.id) | `216.150.1.1` | tanpa www, dialihkan ke www |
| A | `@` (kosong / vitaminku.id) | `216.150.16.1` | catatan A kedua, opsional tapi disarankan |

Catatan:
- Jangan ubah nameserver. Tetap `nsx1.domainesia.com` dan `nsx2.domainesia.com`.
- Bila Domainesia menolak CNAME pada `www` karena sudah ada catatan A di `www`, hapus dulu catatan `www` yang lama.
- Sertifikat HTTPS dibuat Vercel otomatis setelah DNS terbaca, biasanya beberapa menit.
- `vitaminku.id` tanpa www dialihkan permanen (308) ke `https://www.vitaminku.id`.

## Sesudah DNS terbaca (dikerjakan agen)

1. Ganti variabel `SITE_URL`, `VITE_SITE_URL`, `PUBLIC_SITE_URL` di Vercel menjadi `https://www.vitaminku.id`.
   Ini dipakai peta situs, tautan pesanan, dan alamat kembali Midtrans, jadi jangan diganti sebelum domain hidup.
2. Rilis ulang produksi agar variabel baru terpakai.
3. Uji produksi di alamat baru: cek-saja, uji belanja tamu, uji Vita, watermark.
4. Alias lama `vitaminku.vercel.app` tetap hidup dan tetap bisa dipakai.
