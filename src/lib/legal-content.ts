// Teks halaman hukum (template netral). SEMUA berstatus DRAF sampai pemilik/penasihat hukum meninjau.
// Jangan mengarang identitas usaha: nilai yang belum diketahui ditulis sebagai [ISI: ...].

export const LEGAL_DRAFT_NOTICE = "Draf — perlu ditinjau pemilik sebelum dipublikasikan";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDoc {
  slug: "syarat" | "privasi" | "pengembalian";
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
}

const CONTACT: LegalSection = {
  heading: "Kontak",
  paragraphs: [
    "Pertanyaan tentang halaman ini dapat disampaikan ke [ISI: email kontak resmi] atau WhatsApp [ISI: nomor WhatsApp admin].",
    "Nama usaha: [ISI: nama badan usaha]. Alamat: [ISI: alamat usaha].",
  ],
};

export const LEGAL_DOCS: Record<LegalDoc["slug"], LegalDoc> = {
  syarat: {
    slug: "syarat",
    title: "Syarat & Ketentuan",
    description: "Syarat dan ketentuan berbelanja di VitaminKu: pemesanan, harga, pembayaran, pengiriman, dan batas tanggung jawab.",
    intro:
      "Dengan memakai situs dan memesan di VitaminKu, kamu setuju pada ketentuan berikut. Berlaku sejak [ISI: tanggal berlaku].",
    sections: [
      {
        heading: "Tentang kami",
        paragraphs: ["VitaminKu dikelola oleh [ISI: nama badan usaha]. Katalog menampilkan vitamin, suplemen, dan perlengkapan olahraga."],
      },
      {
        heading: "Pemesanan",
        paragraphs: [
          "Pesanan dianggap diterima setelah kamu menyelesaikan checkout. Untuk sebagian pesanan, admin kami mengonfirmasi ketersediaan dan total biaya lebih dulu lewat WhatsApp sebelum pesanan diproses.",
          "Kami dapat menolak atau membatalkan pesanan bila stok tidak tersedia, harga atau data produk salah, atau alamat tidak lengkap. Bila sudah ada pembayaran, pengembaliannya mengikuti halaman Pengembalian.",
        ],
      },
      {
        heading: "Harga dan stok",
        paragraphs: [
          "Harga ditampilkan dalam rupiah dan dihitung ulang oleh sistem saat checkout. Produk tanpa harga ditampilkan sebagai \"Harga menyusul\" dan belum bisa dipesan.",
          "Stok dapat berubah sewaktu-waktu. Ketersediaan final dikonfirmasi saat pesanan diproses.",
        ],
      },
      {
        heading: "Pembayaran",
        paragraphs: [
          "Metode pembayaran yang tersedia ditampilkan di halaman checkout dan dapat berubah. Kami tidak pernah meminta kata sandi, PIN, atau kode OTP lewat pesan.",
        ],
      },
      {
        heading: "Pengiriman",
        paragraphs: [
          "Biaya dan estimasi pengiriman ditampilkan sebelum kamu menyelesaikan pesanan dan bergantung pada alamat tujuan serta kurir. Pastikan alamat dan nomor WhatsApp yang kamu isi benar.",
        ],
      },
      {
        heading: "Informasi produk",
        paragraphs: [
          "Informasi produk disusun dari data kemasan dan penyedia produk. Informasi ini bukan nasihat medis. Baca label pada kemasan, dan bila kamu memiliki kondisi khusus, sedang hamil atau menyusui, atau sedang memakai obat, tanyakan lebih dulu kepada tenaga kesehatan.",
        ],
      },
      {
        heading: "Pemakaian situs",
        paragraphs: ["Kamu setuju tidak menyalahgunakan situs, misalnya mengakses data pihak lain, mengganggu layanan, atau memesan dengan data palsu."],
      },
      {
        heading: "Batas tanggung jawab",
        paragraphs: [
          "Sejauh diizinkan hukum, tanggung jawab kami terbatas pada nilai pesanan yang bersangkutan. Ketentuan ini tidak mengurangi hak konsumen yang dijamin peraturan perundang-undangan.",
        ],
      },
      {
        heading: "Perubahan ketentuan",
        paragraphs: ["Ketentuan dapat diperbarui. Versi terbaru selalu ada di halaman ini dengan tanggal berlaku yang tertera."],
      },
      CONTACT,
    ],
  },
  privasi: {
    slug: "privasi",
    title: "Kebijakan Privasi",
    description: "Data apa yang dikumpulkan VitaminKu, untuk apa dipakai, berapa lama disimpan, dan hak kamu atas data tersebut.",
    intro:
      "Halaman ini menjelaskan data pribadi yang kami kumpulkan saat kamu memakai VitaminKu dan cara kami menjaganya. Berlaku sejak [ISI: tanggal berlaku].",
    sections: [
      {
        heading: "Data yang kami kumpulkan",
        paragraphs: ["Saat kamu memesan atau membuat akun, kami meminta data seperlunya:"],
        bullets: [
          "Nama, nomor WhatsApp, dan email (bila diisi).",
          "Alamat pengiriman dan catatan pesanan.",
          "Riwayat pesanan dan produk yang kamu simpan.",
          "Data teknis dasar, misalnya jenis peramban dan catatan galat tanpa identitas, untuk menjaga situs tetap berjalan.",
        ],
      },
      {
        heading: "Untuk apa data dipakai",
        paragraphs: [],
        bullets: [
          "Memproses, mengirim, dan mengonfirmasi pesanan.",
          "Menghubungi kamu tentang pesanan lewat WhatsApp atau email.",
          "Mencegah penyalahgunaan dan memperbaiki masalah teknis.",
          "Menawarkan promo hanya bila kamu menyatakan setuju. Persetujuan itu bisa kamu cabut kapan saja.",
        ],
      },
      {
        heading: "Dengan siapa data dibagikan",
        paragraphs: [
          "Kami tidak menjual data pribadi. Data dibagikan seperlunya kepada kurir untuk pengiriman, penyedia pembayaran untuk memproses transaksi, dan penyedia infrastruktur yang menjalankan situs ini, sebatas keperluan layanan. Daftar pihak terkait: [ISI: daftar pihak ketiga yang dipakai].",
        ],
      },
      {
        heading: "Berapa lama data disimpan",
        paragraphs: ["Data pesanan disimpan selama [ISI: lama penyimpanan] untuk keperluan layanan, pembukuan, dan kewajiban hukum, lalu dihapus atau dianonimkan."],
      },
      {
        heading: "Keamanan",
        paragraphs: [
          "Akses ke data pelanggan dibatasi untuk staf yang berwenang dan setiap unduhan data internal dicatat. Tidak ada sistem yang sepenuhnya bebas risiko; bila terjadi insiden yang memengaruhi data kamu, kami akan memberi tahu sesuai ketentuan yang berlaku.",
        ],
      },
      {
        heading: "Hak kamu",
        paragraphs: [
          "Kamu dapat meminta akses, perbaikan, atau penghapusan data pribadimu, serta mencabut persetujuan promo, dengan menghubungi kami lewat kontak di bawah. Kami akan menanggapi dalam [ISI: jangka waktu tanggapan].",
        ],
      },
      {
        heading: "Cookie dan penyimpanan di peramban",
        paragraphs: ["Situs menyimpan keranjang, daftar simpanan, dan riwayat pesanan terakhir di peramban kamu agar bisa dipakai lagi. Kamu dapat menghapusnya lewat pengaturan peramban."],
      },
      CONTACT,
    ],
  },
  pengembalian: {
    slug: "pengembalian",
    title: "Kebijakan Pengembalian",
    description: "Ketentuan pengembalian barang dan dana di VitaminKu: kapan bisa diajukan, caranya, dan pengecualiannya.",
    intro:
      "Kami ingin kamu menerima pesanan yang benar dan dalam kondisi baik. Halaman ini menjelaskan kapan dan bagaimana kamu bisa mengajukan pengembalian. Berlaku sejak [ISI: tanggal berlaku].",
    sections: [
      {
        heading: "Kapan bisa diajukan",
        paragraphs: ["Kamu dapat mengajukan pengembalian atau penggantian bila:"],
        bullets: [
          "Barang yang diterima rusak atau bocor saat sampai.",
          "Barang yang dikirim salah (produk, varian, atau jumlah tidak sesuai pesanan).",
          "Segel kemasan sudah terbuka saat diterima.",
        ],
      },
      {
        heading: "Batas waktu",
        paragraphs: ["Ajukan paling lambat [ISI: jumlah hari] hari setelah barang diterima, dengan nomor pesanan dan bukti yang jelas."],
      },
      {
        heading: "Cara mengajukan",
        paragraphs: ["Hubungi kami lewat kontak di bawah dan sertakan:"],
        bullets: [
          "Nomor pesanan.",
          "Foto atau video barang dan kemasan luarnya, termasuk label pengiriman.",
          "Video saat paket dibuka, bila ada.",
        ],
      },
      {
        heading: "Yang tidak dapat dikembalikan",
        paragraphs: [],
        bullets: [
          "Produk yang segelnya sudah dibuka atau sudah dipakai, kecuali karena kesalahan kami.",
          "Produk yang rusak karena penyimpanan atau pemakaian yang tidak semestinya setelah diterima.",
          "Pengajuan di luar batas waktu di atas.",
        ],
      },
      {
        heading: "Penggantian dan pengembalian dana",
        paragraphs: [
          "Setelah pengajuan disetujui, kami menawarkan penggantian barang atau pengembalian dana sesuai ketersediaan. Pengembalian dana dikirim ke rekening atau metode pembayaran asal dalam [ISI: jangka waktu pengembalian dana] hari kerja.",
          "Biaya pengiriman pengembalian ditanggung oleh [ISI: pihak penanggung biaya] untuk kasus barang rusak atau salah kirim.",
        ],
      },
      {
        heading: "Pembatalan pesanan",
        paragraphs: ["Pesanan yang belum dikirim dapat dibatalkan dengan menghubungi kami secepatnya. Pesanan yang sudah dikirim mengikuti ketentuan di atas."],
      },
      CONTACT,
    ],
  },
};
