# Uji cepat setelah deploy (jangan membuat pesanan sungguhan di produksi; pakai nomor/nama uji dan batalkan lewat Pesanan Masuk)

1. **Checkout tamu** — tanpa login: tambah produk → Checkout → isi nama, WhatsApp, alamat → Pesan. Harapan: tab WhatsApp terbuka ke admin cabang; halaman pesanan tampil; cukup 3 kolom wajib.
2. **Kode FITLIFE10** — berlaku **1 Nov 2026 00:00 – 1 Des 2026 23:59 WITA**. Sebelum 1 Nov: kode ditolak ("belum berlaku"). Dalam jendela: potongan 10% muncul di ringkasan; setelah 1 Des: ditolak. (Jendela di database sudah terbaca benar: 31 Okt 16:00 UTC – 1 Des 15:59 UTC.)
3. **Tautan cabang** — buka `/?cabang=KODE` (isi KODE cabang di Cabang & Admin) → di Checkout cabang itu sudah terpilih. Admin tanpa koordinat tidak pernah terpilih otomatis oleh lokasi.
4. **Login pelanggan** — `/masuk` → email → ketuk tautan di email → `/akun` menampilkan data & riwayat. Setelah pesanan tamu: tombol "Simpan data saya".
5. **Login owner** — Kings & Livita: `/masuk` (atau `/admin/login`) → `/admin` terbuka; menu Pengguna & Cadangan tampil.
6. **Manajer dibatasi** — masuk sebagai Manajer (GM/Admin): menu Pengguna, Cadangan, Daftar Blokir (ubah) tidak tersedia; membuka alamatnya langsung → ditolak (403); tidak ada fitur penarikan/pencairan/refund uang. HPP tidak tampil kecuali izin diberikan owner.
7. **Tim Produk** — masuk: hanya Tambah Cepat, Antrian Kerja, produk & foto; tidak bisa lihat pesanan atau pengguna.
8. **Pesanan Masuk** — pesanan uji muncul di tahap Baru; Konfirmasi → Dikemas → Dikirim → Selesai; lalu batalkan pesanan uji lain; stok berubah sekali.
Catat LULUS/GAGAL + foto layar. Uji tampilan 390px (ponsel) belum pernah dijalankan oleh Claude: BELUM DIVERIFIKASI.
