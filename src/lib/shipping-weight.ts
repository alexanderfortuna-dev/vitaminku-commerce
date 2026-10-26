// Berat tertagih untuk ongkir (murni, tanpa I/O). Kurir menagih yang lebih besar antara berat asli dan berat volume.
// Berat volume (gram) = panjang × lebar × tinggi (cm) / 6000 × 1000. Tidak ada angka yang dikarang: bila berat DAN ukuran
// sama-sama kosong, dipakai berat cadangan dan baris itu ditandai `fallback` agar muncul di daftar "Data kurang".
export const VOLUMETRIC_DIVISOR = 6000;
/** Berat cadangan per unit bila berat dan ukuran produk sama-sama belum diisi. */
export const FALLBACK_ITEM_WEIGHT_GRAMS = 500;

export interface ProductShipData {
  weight_grams?: number | string | null | undefined;
  length_cm?: number | string | null | undefined;
  width_cm?: number | string | null | undefined;
  height_cm?: number | string | null | undefined;
}

export type WeightSource = "weight" | "volumetric" | "fallback";

export interface UnitWeight {
  grams: number;
  source: WeightSource;
  /** Ukuran lengkap (p×l×t) bila ada, dikirim ke kurir. */
  dims: { length: number; width: number; height: number } | null;
}

const pos = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function volumetricGrams(l: number, w: number, h: number): number {
  return Math.ceil(((l * w * h) / VOLUMETRIC_DIVISOR) * 1000);
}

/** Berat tertagih satu unit produk. */
export function unitBillableWeight(p: ProductShipData): UnitWeight {
  const weight = pos(p.weight_grams);
  const l = pos(p.length_cm), w = pos(p.width_cm), h = pos(p.height_cm);
  const dims = l !== null && w !== null && h !== null ? { length: l, width: w, height: h } : null;
  const vol = dims ? volumetricGrams(dims.length, dims.width, dims.height) : null;
  if (weight !== null && vol !== null) return vol > weight ? { grams: vol, source: "volumetric", dims } : { grams: Math.ceil(weight), source: "weight", dims };
  if (weight !== null) return { grams: Math.ceil(weight), source: "weight", dims };
  if (vol !== null) return { grams: vol, source: "volumetric", dims };
  return { grams: FALLBACK_ITEM_WEIGHT_GRAMS, source: "fallback", dims: null };
}

export interface BillableLineInput extends ProductShipData {
  quantity: number;
}

export interface BillableSummary {
  totalGrams: number;
  /** Jumlah baris yang memakai berat cadangan (data produk belum lengkap). */
  fallbackLines: number;
}

export function billableTotal(lines: BillableLineInput[]): BillableSummary {
  let totalGrams = 0, fallbackLines = 0;
  for (const l of lines) {
    const u = unitBillableWeight(l);
    totalGrams += u.grams * Math.max(0, Math.floor(l.quantity));
    if (u.source === "fallback") fallbackLines++;
  }
  return { totalGrams, fallbackLines };
}

/** Persentase (0–100, satu desimal) produk dengan data ongkir lengkap, untuk laporan cakupan. */
export function shippingCoverage(rows: ProductShipData[]): { total: number; withWeight: number; withDims: number; pctWeight: number; pctDims: number } {
  const total = rows.length;
  const withWeight = rows.filter((r) => pos(r.weight_grams) !== null).length;
  const withDims = rows.filter((r) => pos(r.length_cm) !== null && pos(r.width_cm) !== null && pos(r.height_cm) !== null).length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  return { total, withWeight, withDims, pctWeight: pct(withWeight), pctDims: pct(withDims) };
}
