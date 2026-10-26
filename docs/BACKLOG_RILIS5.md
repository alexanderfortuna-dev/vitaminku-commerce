# Backlog Rilis 5 (tidak memblokir rilis; dicatat jujur)

Sumber: peninjauan independen Rilis 5 dan hal yang sengaja belum dibuktikan.

| # | Hal | Status | Langkah berikutnya |
|---|---|---|---|
| 1 | Nama kolom permintaan Biteship untuk kurir instan (koordinat asal/tujuan, `couriers: gojek,grab`) dan bentuk jawabannya | BELUM TERVERIFIKASI (belum ada kunci; fixture sintetis) | Setelah owner memasang `BITESHIP_API_KEY` sandbox: jalankan satu permintaan instan, samakan fixture dengan jawaban asli, baru nyalakan `INSTANT_DELIVERY_ENABLED` |
| 2 | Parameter `expiry` Snap (ditulis `unit: "hour"`, 24) dan karakter `~` pada `order_id` Midtrans | BELUM TERVERIFIKASI di sandbox Midtrans. Bila Midtrans menolak expiry, kode mengulang tanpa expiry (bawaan Snap juga 24 jam) | Buat satu link uji di sandbox sebelum kunci produksi dipasang |
| 3 | Harga instan memakai titik lokasi dari browser | Risiko diterima: staf mengonfirmasi tiap pesanan, catatan staf memuat jarak garis lurus dan perintah mencocokkan alamat | Tambah batas harga berdasar jarak yang dihitung server bila ada penyalahgunaan |
| 4 | Tes ujung-ke-ujung `createPaymentLink` (ongkir → Snap → simpan) | Hanya bagian murni, webhook, dan RPC yang diuji | Uji sandbox Midtrans dengan kunci owner |
| 5 | Daftar "Data kurang" di Seller Center untuk produk tanpa ukuran | Cakupan dilaporkan di cek-saja (baris 10–11), belum ada filter di antrean kerja | Tambah filter setelah migrasi 0018 dipasang |
| 6 | Kolom `area_id` cabang | Ada di database, belum ada isiannya di Pengaturan (kode pos cukup untuk asal ongkir) | Isi hanya bila Biteship meminta area |
| 7 | Tarif kurir bernilai 0 dibuang (dianggap data rusak) | Disengaja | Ubah bila Biteship terbukti mengembalikan promo ongkir 0 |
