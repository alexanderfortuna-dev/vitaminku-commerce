// Isi template Upload Massal (murni, tanpa Excel): baris CONTOH, daftar pilihan, dan sheet Petunjuk.
// Pembuatan file .xlsx ada di sheet-io.ts (hanya browser).
import { CATEGORIES } from "./catalog";
import { FULL_HEADERS, MAX_PHOTOS } from "./seller-import";
import { SAMPLE_SKU_PREFIX } from "./import-messages";

/** Nilai `category` yang dikenal toko (dropdown Kategori). */
export const TEMPLATE_CATEGORIES: string[] = CATEGORIES.map((c) => c.category);
/** Nilai Status yang diterima importer. */
export const TEMPLATE_STATUSES = ["Live", "Draf"] as const;

export const TEMPLATE_DATA_SHEET = "Data";
export const TEMPLATE_HELP_SHEET = "Petunjuk";
export const TEMPLATE_LISTS_SHEET = "Daftar";

/** Dua baris contoh. SKU berawalan CONTOH sehingga importer menolaknya bila lupa dihapus. */
export function templateSampleRows(): Array<Array<string | number>> {
  const blankPhotos = Array<string>(MAX_PHOTOS - 1).fill("");
  const cat = TEMPLATE_CATEGORIES[0] ?? "";
  return [
    [
      `${SAMPLE_SKU_PREFIX}-001`, "Nama produk lengkap, misalnya Vitamin C 1000 mg isi 60", "Nama merek", cat,
      "Deskripsi singkat produk (boleh dikosongkan)", 125000, 20, 150, "", "", "", "", "https://contoh.com/foto-produk.jpg", ...blankPhotos, "Draf",
    ],
    [
      `${SAMPLE_SKU_PREFIX}-002`, "Contoh produk kedua (hapus baris CONTOH sebelum diunggah)", "Nama merek", cat,
      "", 89000, 0, 250, "", "", "", "", "", ...blankPhotos, "Draf",
    ],
  ];
}

export function templateHeaderCount() {
  return FULL_HEADERS.length;
}

/** Teks lembar Petunjuk, satu string per baris. */
export function templateInstructionLines(): string[] {
  return [
    "PETUNJUK UPLOAD MASSAL",
    "",
    "Cara pakai",
    "1. Isi sheet \"Data\". Satu baris = satu produk. Jangan ubah nama kolom di baris pertama.",
    `2. Hapus dulu baris contoh (SKU berawalan ${SAMPLE_SKU_PREFIX}). Baris contoh tidak akan disimpan.`,
    "3. Simpan sebagai .xlsx atau .csv, lalu unggah di halaman Upload Massal. Kamu akan melihat pratinjau dulu; belum ada yang tersimpan sampai kamu menekan Terapkan.",
    "4. Salah unggah? Tekan \"Batalkan impor terakhir\" di halaman Upload Massal. Produk baru dari impor itu diarsipkan (tidak dihapus), produk lama dikembalikan.",
    "",
    "Arti setiap kolom",
    "SKU (wajib) : kode unik produk. SKU yang sudah ada = produk diperbarui. SKU baru = produk baru.",
    "Nama, Brand, Kategori (wajib untuk produk baru) : Kategori pilih dari daftar yang muncul di sel.",
    "Deskripsi : keterangan produk. Jangan menulis klaim penyembuhan penyakit.",
    "Harga : rupiah, angka saja, contoh 125000. Harus lebih dari 0.",
    "Stok : jumlah barang, angka bulat, contoh 10. Boleh 0.",
    "Berat_gram : berat kemasan dalam gram, contoh 250. Harus lebih dari 0.",
    "Panjang_cm, Lebar_cm, Tinggi_cm : ukuran kemasan dalam cm, contoh 30 / 20 / 10. Kosongkan bila belum diukur, jangan menebak. Isi ketiganya bersama. Dipakai menghitung ongkir dari berat volume (p×l×t÷6000 kg).",
    "BPOM : nomor izin edar bila produk punya. Kosongkan bila belum ada; jangan diisi dugaan.",
    `Foto_1 sampai Foto_${MAX_PHOTOS} : tautan foto yang diawali https://. Kosong = foto lama tetap. Foto diunduh lalu disimpan ulang di toko.`,
    "Status : Live (tampil di toko) atau Draf (disimpan dulu). Kosong = status tidak diubah.",
    "",
    "Syarat supaya produk bisa Live",
    "Harga lebih dari 0, ada minimal satu foto, stok tidak minus, dan berat lebih dari 0. Kalau belum lengkap, produk tetap disimpan sebagai Draf dan alasannya ditampilkan.",
    "",
    "Hal yang perlu diingat",
    "- Produk yang dilarang dijual otomatis ditolak dan ditandai di pratinjau.",
    "- Harga modal tidak ada di file ini dan tidak bisa diimpor.",
    "- Centang \"Timpa\" hanya bila kamu ingin mengganti data yang sudah terisi. Tanpa centang, hanya kolom yang masih kosong yang diisi.",
    "- Bila ada baris yang salah, pesannya menyebut nomor baris dan cara memperbaikinya. Baris yang benar tetap bisa disimpan.",
  ];
}
