# Panduan Owner VitaminKu

Satu halaman untuk menjalankan toko tanpa coding. Versi yang sama ada di Seller Center → **Panduan**.

## Alamat penting
- **Toko (pelanggan):** alamat Vercel proyek `vitaminku` (muncul setelah rilis pertama; nanti diganti domain toko).
- **Seller Center:** alamat toko + `/admin` (atau `/seller`).
- **Database:** [Supabase → proyek vitaminku](https://supabase.com/dashboard/project/vmhoohfwjtsojgcvopaf). Jangan buka proyek "nolimit-system" untuk urusan toko.
- **Tombol rilis & database:** [GitHub → Actions → "VitaminKu — Database & Rilis Website"](https://github.com/alexanderfortuna-dev/vitaminku-commerce/actions).

## Siapa masuk sebagai apa
- **Owner** – email Anda (yang diisi di `ADMIN_BOOTSTRAP_EMAIL` saat rilis). Bisa semua, termasuk HPP, akun staf, cadangan data.
- **Co-Owner** – sama dengan owner, ditambahkan lewat menu **Akun Staf**.
- **Manajer (General Manager / Admin)** – produk, harga, stok, pesanan, promo, cabang. Tidak bisa melihat HPP kecuali diizinkan.
- **Tim Produk** – menambah/mengubah produk dan foto saja.
- Semua masuk lewat `/masuk` dengan tautan yang dikirim ke email (tanpa kata sandi).

## Menambah akun staf
1. Seller Center → **Akun Staf** → isi email staf → pilih peran → **Undang via email**.
2. Staf membuka email undangan dan klik tautannya. Selesai.
3. Tanpa email undangan: di kartu **Kode aktivasi staf** isi email staf, pilih peran, klik **Buat kode aktivasi**, lalu **Salin pesan untuk dikirim**. Staf membuka tautan `/admin/aktivasi`, memakai email + kode itu, dan membuat kata sandi sendiri. Kode terikat ke satu email, berlaku 14 hari, dan sekali pakai selama akun stafnya ada.
   - Kirim pesan aktivasi lewat saluran tertutup (WhatsApp pribadi ke orangnya). Siapa pun yang memegang email + kode bisa mengaktifkan lebih dulu.
   - Mencabut kode sebelum dipakai: ganti rahasia `STAFF_ACTIVATION_SECRET` di Vercel (semua kode lama batal; buat kode baru).
   - Untuk menonaktifkan staf, pakai **Nonaktifkan**, jangan hapus akunnya di dasbor Supabase.
4. Menonaktifkan staf: di **Akun Staf** klik **Nonaktifkan** pada nama staf (akun tidak dihapus).

## Mengisi harga dan stok
1. Seller Center → **Ubah Harga & Stok** → **1. Unduh Template**.
2. Isi kolom harga (contoh `125000`) dan stok, simpan sebagai Excel/CSV.
3. **2. Unggah File** → baca **3. Pratinjau** (baris salah ditandai beserta alasannya; belum disimpan) → simpan.
4. Produk tanpa harga tetap tampil dengan tombol "Tanya harga via WA" sampai harganya diisi.

## Menyetujui foto dari Shopee
1. Seller Center → **Foto Produk dari Shopee** → pilih file CSV Shopee → **Cek dulu** (tidak menyimpan apa pun).
2. Periksa 10 contoh pasangan. Bila benar, ketik `TERAPKAN` → foto yang yakin cocok dipasang otomatis.
3. Di bagian **Perlu ditinjau**, pilih foto yang benar dengan **Pakai foto ini**, atau **Lewati produk ini**.
4. Nama, deskripsi, dan kategori produk tidak pernah diubah oleh fitur ini.

## Nomor WhatsApp cabang
Seller Center → **Cabang & Admin**: isi nomor WhatsApp tiap cabang (format `0812…` atau `62812…`).
Pesanan pelanggan otomatis dikirim ke WhatsApp cabang yang dipilih.

## Kalau ada yang rusak
1. Seller Center → **Cadangan Data & Gangguan**: lihat pesan gangguan terbaru.
2. Buka sesi Claude Code di repo `vitaminku-commerce`, tulis apa yang terjadi (sertakan tangkapan layar).
3. Database dicek aman dengan tombol **cek-saja** di GitHub Actions (hanya membaca, tidak mengubah apa pun).
