# Verifikasi setelah PASTE_SEKALI.sql (hanya SELECT; aman dijalankan di SQL Editor proyek vmhoohfwjtsojgcvopaf)

| # | Periksa | Perintah | Hasil yang benar |
|---|---|---|---|
| 1 | Tabel baru | `select table_name from information_schema.tables where table_schema='public' and table_name in ('customers','branch_admins','product_imports','product_import_rows') order by 1;` | 4 baris |
| 2 | Fungsi | `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('has_permission','public_branch_contacts','staff_set_order_stage','undo_product_import','owner_remove_block','chat_rate_hit') order by 1;` | 6 baris |
| 3 | Trigger owner terakhir | `select count(*) from pg_trigger where tgname='user_roles_protect_trg';` | 1 |
| 4 | Kolom pesanan | `select column_name from information_schema.columns where table_name='orders' and column_name in ('stage','customer_id');` | 2 baris |
| 5 | RLS aktif di semua tabel | `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;` | 0 baris |
| 6 | Anon/pelanggan tak bisa baca HPP | `select has_column_privilege('anon','public.products','hpp','SELECT'), has_column_privilege('authenticated','public.products','hpp','SELECT');` | `false, false` |
| 7 | Produk utuh | `select count(*) from products;` | 1461 |
| 8 | Anon tak bisa baca daftar admin cabang | `select has_table_privilege('anon','public.branch_admins','SELECT');` | `false` |
| 9 | Kontak publik hanya peran+nomor | `select * from public.public_branch_contacts();` | kolom hanya branch_id, role, whatsapp (0 baris sebelum admin diisi) |

Catat tiap baris LULUS/GAGAL. Bila ada GAGAL, kirim hasilnya ke Claude — jangan jalankan perbaikan sendiri.
Status saat dokumen ini ditulis: #7 sudah diperiksa **LULUS (1461)** dan #6 **LULUS (false,false)** pada 14 Okt 2026; #1–#5, #8–#9 **belum** (SQL belum diterapkan).
