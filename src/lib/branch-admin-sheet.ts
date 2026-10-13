// Browser-only: membuat cabang-admin-template.xlsx (exceljs dimuat lazy lewat sheet-io).
import { SAMPLE_ROW, TEMPLATE_HEADERS } from "./branch-admin-import";
import { downloadBlob, loadExcel } from "./sheet-io";

const GUIDE: string[] = [
  "PETUNJUK ISI TEMPLATE CABANG & ADMIN",
  "",
  "1. Isi sheet 'Data'. Satu baris = satu admin. Cabang yang sama ditulis di beberapa baris (satu baris per admin).",
  "2. Hapus baris CONTOH (baris 2) sebelum diunggah. Baris CONTOH tetap dilewati otomatis.",
  "3. Kode_Cabang: 2-24 huruf/angka (boleh - dan _), tanpa spasi. Contoh: SANUR. Kode ini dipakai di tautan ?cabang=SANUR.",
  "4. Nama_Cabang wajib untuk cabang baru. Untuk cabang yang sudah ada, kolom cabang yang dikosongkan = tidak diubah.",
  "5. Link_Google_Maps: salin dari Google Maps. Link pendek (maps.app.goo.gl) tidak bisa dibaca koordinatnya: cabang tetap bisa dipilih pelanggan, tapi tidak dipilih otomatis.",
  "6. Peran_Admin: pilih Utama atau Cadangan dari daftar. Setiap cabang hanya boleh punya SATU admin Utama yang aktif.",
  "7. Nomor_WA: boleh 0813 3995 0000 atau +62 813 3995 0000. Nomor ini menjadi kunci admin; mengganti nomor = admin baru.",
  "8. Aktif: pilih Ya atau Tidak. Admin tidak pernah dihapus, hanya dinonaktifkan (Aktif = Tidak). Kosong = Ya.",
  "9. Unggah file di halaman Admin Cabang > Impor Massal. Anda akan melihat pratinjau dulu; belum ada yang tersimpan sampai menekan Terapkan.",
  "10. Mengunggah file yang sama dua kali aman: tidak ada data ganda.",
];

export async function downloadBranchAdminTemplate() {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...TEMPLATE_HEADERS]);
  ws.addRow([...SAMPLE_ROW]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
  ws.getRow(2).font = { italic: true, color: { argb: "FF9A6700" } };
  ws.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CE" } };
  [16, 28, 36, 44, 26, 14, 22, 18, 8].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  // kolom Nomor_WA sebagai teks agar angka 0 di depan tidak hilang
  ws.getColumn(8).numFmt = "@";
  const LAST = 500;
  for (let r = 2; r <= LAST; r++) {
    ws.getCell(`F${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"Utama,Cadangan"'],
      showErrorMessage: true, errorTitle: "Peran_Admin", error: "Pilih Utama atau Cadangan.",
    };
    ws.getCell(`I${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"Ya,Tidak"'],
      showErrorMessage: true, errorTitle: "Aktif", error: "Pilih Ya atau Tidak.",
    };
    if (r > 2) ws.getCell(`H${r}`).numFmt = "@";
  }
  const guide = wb.addWorksheet("Petunjuk");
  guide.getColumn(1).width = 120;
  GUIDE.forEach((t) => guide.addRow([t]));
  guide.getRow(1).font = { bold: true, size: 13 };
  guide.eachRow((row) => (row.alignment = { wrapText: true, vertical: "top" }));
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob("cabang-admin-template.xlsx", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
