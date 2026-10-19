# Arsip SQL (jangan dijalankan lagi)

Semua isi di sini **sudah tercakup di `drizzle/migrations/`** — satu-satunya folder migrasi yang dipasang ke database.
File disimpan hanya sebagai catatan sejarah.

| File | Dulu dipakai untuk | Isinya sekarang ada di |
|---|---|---|
| `PASTE_SEKALI.sql` | Tempel sekali di SQL Editor: migrasi 0010–0013 + 2 fungsi tertunda | `drizzle/migrations/0010`–`0013` + `0016` |
| `APPLY_0010_0013.sql` | Bagian pertama dari PASTE_SEKALI (0010–0013) | `drizzle/migrations/0010`–`0013` |
| `PENDING_functions_with_delete.sql` | Dua fungsi (batas laju chat, buka blokir) yang tidak bisa dipasang alat otomatis | `drizzle/migrations/0016` |
| `ALL_MIGRATIONS_FOR_NEW_PROJECT.sql` | Gabungan semua migrasi untuk proyek Supabase baru yang kosong (dibuat ulang oleh `scripts/build-migration-bundle.sh`) | `migrasi-awal/` + `drizzle/migrations/` |
| `migrasi-awal/` | Migrasi zaman Lovable (tabel produk dasar, bucket foto, peran). Sudah terpasang di produksi | dipakai uji DB lokal sebagai titik awal |

Skrip yang masih dipakai workflow ada di `supabase/operasi/`:
`cek-database.sql` (cek-saja, hanya baca) dan `aktifkan-peran.sql` (aktifkan peran owner/manajer).
