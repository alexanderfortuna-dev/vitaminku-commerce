# VitaminKu

Toko vitamin dan sports nutrition Limitless Group (Bali). Berdiri sendiri: tidak memakai Shopify,
Lovable, atau platform toko pihak ketiga mana pun.

- **Toko:** https://www.vitaminku.id (alias lama `vitaminku.vercel.app` tetap hidup)
- **Seller Center:** https://www.vitaminku.id/admin
- **Kode:** repositori ini (GitHub)
- **Data:** Supabase (Postgres + Auth + Storage), semua tabel `public` ber-RLS
- **Hosting:** Vercel

## Yang dipakai

| Bagian | Pilihan |
|---|---|
| Frontend + server | TanStack Start (React 19), rute berkas di `src/routes`, Tailwind 4, shadcn |
| Database, auth, berkas | Supabase; tulis data penting hanya lewat RPC `SECURITY DEFINER` |
| Pembayaran | Pesanan ke WhatsApp cabang; Midtrans (QRIS, e-wallet, VA) aktif saat kuncinya dipasang |
| Ongkir | Biteship dari berat dan ukuran nyata, asal kiriman dari cabang terpilih |
| Asisten | Vita di `/api/vitamin-finder`; mode kata kunci bila kunci AI belum ada |
| Foto produk | Bucket privat `product-images`, watermark otomatis, tautan bertanda tangan |

Aturan arsitektur ada di `AGENTS.md`. Aturan kerja agen ada di `CLAUDE.md`.

## Perintah

| Tugas | Perintah |
|---|---|
| Pasang dependensi | `bun install --frozen-lockfile` |
| Pemeriksaan lengkap (wajib sebelum PR) | `bash scripts/verify.sh` |
| Uji database (Postgres 16 lokal, tidak pernah produksi) | `bash test/db/run.sh` |
| Uji asisten Vita | `bun run eval:vita` |

## Aturan yang tidak bisa dilanggar

1. Harga modal (HPP) tidak pernah sampai ke pelanggan, bundel browser, API tamu, atau Vita.
2. Pesanan hanya lewat RPC `create_order`; harga selalu dihitung ulang dari database.
3. Produk terlarang (obat keras, SARMs, modafinil, yohimbe, DHEA) diblokir di tingkat database.
4. Perubahan database = berkas migrasi baru yang aditif di `drizzle/migrations`, dipasang pemilik.
5. Tidak ada rahasia di repositori ini; repositori bersifat publik.

## Riwayat

Dokumen masa Lovable dan Shopify disimpan di `docs/arsip/` sebagai catatan sejarah, bukan acuan.
Keadaan terkini dan pelajaran ada di `.claude/state/PROGRESS.md` dan `.claude/state/LESSONS.md`.
