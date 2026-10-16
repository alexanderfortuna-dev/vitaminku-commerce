// Pesan validasi Upload Massal dalam bahasa sederhana: sebut kolomnya, apa yang salah, dan cara memperbaikinya.
// Murni (tanpa I/O) supaya bisa dipakai planner di server maupun UI, dan mudah diuji.
import type { ParseResult } from "./bulk-price-stock";

export interface IssueLike {
  row: number;
  sku: string;
  reason: string;
}

/** Awalan baris contoh di template. Baris seperti ini TIDAK pernah disimpan. */
export const SAMPLE_SKU_PREFIX = "CONTOH";

export function isSampleSku(sku: string): boolean {
  return sku.trim().toUpperCase().startsWith(SAMPLE_SKU_PREFIX);
}

/** "Baris 5 (SKU N-3): alasan" — dipakai di layar dan di laporan error. */
export function formatIssue(i: IssueLike): string {
  const sku = i.sku ? ` (SKU ${i.sku})` : "";
  return `Baris ${i.row}${sku}: ${i.reason}`;
}

const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

/** Pesan untuk kolom angka (Harga, Stok, Berat_gram) yang tidak terbaca; null bila tidak ada masalah baca. */
export function numberReadProblem(field: string, example: string, parsed: ParseResult, raw: string): string | null {
  if (parsed.kind !== "error") return null;
  if (/negatif/.test(parsed.message)) return `${field} tidak boleh minus. Tulis angka saja, contoh ${example}.`;
  return `${field} "${clip(raw)}" tidak terbaca sebagai angka. Tulis angka saja tanpa huruf, contoh ${example}.`;
}

export const MSG = {
  skuEmpty: "Kolom SKU kosong. Isi kode SKU yang unik untuk produk ini, atau hapus barisnya.",
  skuDuplicate: "SKU ini muncul lebih dari satu kali di file. Pakai satu baris saja untuk setiap SKU.",
  sample: "Ini baris CONTOH dari template, jadi tidak disimpan. Hapus barisnya, atau ganti SKU dengan SKU produk kamu.",
  priceZero: "Harga tidak boleh 0. Isi harga jual dalam rupiah, contoh 125000.",
  stockFraction: "Stok harus bilangan bulat (tanpa koma). Contoh: 10.",
  weightZero: "Berat_gram harus lebih dari 0. Isi berat dalam gram, contoh 250.",
  maxPhotos: (max: number) => `Foto terlalu banyak. Maksimal ${max} foto per produk (kolom Foto_1 sampai Foto_${max}).`,
  status: (raw: string) =>
    `Status "${clip(raw)}" tidak dikenal. Isi Live (tampil di toko) atau Draf (disimpan dulu), atau kosongkan.`,
  photo: (raw: string) =>
    `Alamat foto "${clip(raw)}" tidak benar. Isi dengan tautan yang diawali https://, atau kosongkan kolom Foto.`,
  newRequired: (field: string) =>
    `Produk baru wajib punya ${field}, tapi kolom ${field} masih kosong. Isi kolom ${field}.`,
  blocked: (reason: string) =>
    `Produk ini tidak boleh dijual di toko (${reason}). Hapus barisnya dari file.`,
  draft: (missing: string[]) =>
    `Disimpan sebagai Draf karena ${missing.join(", ")}. Lengkapi datanya, lalu ubah Status ke Live.`,
};
