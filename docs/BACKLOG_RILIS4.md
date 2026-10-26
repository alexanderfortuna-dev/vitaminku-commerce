# Backlog Rilis 4 — temuan audit yang TIDAK diperbaiki di rilis ini (bukan penghalang rilis)

Audit 2026-10-22 atas rute pelanggan (/, /kategori, /merek, /tujuan, /produk, /cari, /keranjang, /checkout, /pesanan, /masuk, /akun) dan Seller Center.

| # | Temuan | Dampak | Usulan |
|---|---|---|---|
| 1 | 196 produk aktif tanpa harga tampil "Tanya harga via WA" | Konversi: pelanggan tidak bisa langsung beli | Isi harga lewat Ubah Harga & Stok (data owner) |
| 2 | Hanya 31 dari ~1.413 produk punya foto | Kepercayaan & klik | Terapkan antrean Foto Produk dari Shopee (menunggu TERAPKAN) |
| 3 | Nomor WhatsApp sebagian cabang kosong → pesanan jatuh ke nomor utama | Pesanan tidak sampai ke cabang terdekat | Isi di Cabang & Admin (data owner) |
| 4 | Pembayaran online (QRIS/VA) belum aktif; semua pesanan lewat WhatsApp | Beban admin, tanpa konfirmasi otomatis | Pasang kunci Midtrans di Vercel (keputusan & dana owner) |
| 5 | Masuk dengan Google tersembunyi sampai VITE_GOOGLE_LOGIN=true dan provider Google diaktifkan di Supabase | Pelanggan hanya bisa masuk via tautan email | Aktifkan provider Google (owner) lalu set variabel di Vercel |
| 6 | Tidak ada notifikasi push promo; kanal promo = spanduk di situs + opt-in WhatsApp manual | Jangkauan promo terbatas | Evaluasi web push setelah ada basis pelanggan opt-in |
| 7 | Beberapa teks UI pelanggan masih memakai "kamu" (keranjang, tersimpan) sementara Vita memakai "Anda" | Konsistensi nada | Samakan ke satu gaya pada rilis berikutnya |
| 8 | Halaman admin belum diaudit kontras mode gelap per layar (token sudah berlaku) | Kemungkinan teks kurang kontras di tabel admin | Jalankan uji kontras untuk /admin setelah login staf |
