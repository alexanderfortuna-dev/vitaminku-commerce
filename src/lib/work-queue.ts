// Penyusun "Antrian Kerja" (logika murni): produk AKTIF yang masih kurang foto / harga / berat.
// Dibaca lewat klien pengguna (RLS) di work-queue.functions.ts; modul ini hanya menyusun filter, urutan, dan label.
import { hasPhoto, isPurchasable } from "./product-readiness";

export const QUEUE_PAGE_SIZE = 30;

export type QueueFilter = "ALL" | "NO_PHOTO" | "NO_PRICE" | "NO_WEIGHT";
export const QUEUE_FILTERS: readonly QueueFilter[] = ["ALL", "NO_PHOTO", "NO_PRICE", "NO_WEIGHT"];

export const QUEUE_FILTER_LABEL: Record<QueueFilter, string> = {
  ALL: "Semua",
  NO_PHOTO: "Tanpa foto",
  NO_PRICE: "Tanpa harga",
  NO_WEIGHT: "Tanpa berat",
};

export type QueueIssue = "no_photo" | "no_price" | "no_weight";

export const QUEUE_ISSUE_LABEL: Record<QueueIssue, string> = {
  no_photo: "Tanpa foto",
  no_price: "Tanpa harga",
  no_weight: "Tanpa berat",
};

export interface QueueRowInput {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  price: number | string | null;
  stock: number | string | null;
  weight_grams: number | string | null;
  image_url: string | null;
  is_active: boolean;
  is_blocked: boolean;
  is_hero: boolean | null;
}

export interface QueueRow extends Omit<QueueRowInput, "price" | "stock" | "weight_grams"> {
  price: number | null;
  stock: number;
  weight_grams: number | null;
  issues: QueueIssue[];
  /** Hanya true bila toko benar-benar bisa menjualnya (aktif, tidak diblokir, harga > 0, stok > 0). */
  purchasable: boolean;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isValidFilter(value: unknown): value is QueueFilter {
  return typeof value === "string" && (QUEUE_FILTERS as readonly string[]).includes(value);
}

/** Masalah satu produk. Urutan tetap: foto, harga, berat. */
export function queueIssues(p: Pick<QueueRowInput, "price" | "image_url" | "weight_grams">): QueueIssue[] {
  const out: QueueIssue[] = [];
  if (!hasPhoto({ image_url: p.image_url })) out.push("no_photo");
  const price = num(p.price);
  if (price === null || price <= 0) out.push("no_price");
  const weight = num(p.weight_grams);
  if (weight === null || weight <= 0) out.push("no_weight");
  return out;
}

const CLAUSE = {
  NO_PHOTO: "image_url.is.null",
  NO_PRICE: "price.is.null,price.lte.0",
  NO_WEIGHT: "weight_grams.is.null,weight_grams.lte.0",
} as const;

/** Isi untuk PostgREST `.or(...)`. Filter dasar (is_active = true, is_blocked = false) dipasang terpisah. */
export function queueOrClause(filter: QueueFilter): string {
  if (filter === "NO_PHOTO") return CLAUSE.NO_PHOTO;
  if (filter === "NO_PRICE") return CLAUSE.NO_PRICE;
  if (filter === "NO_WEIGHT") return CLAUSE.NO_WEIGHT;
  return [CLAUSE.NO_PHOTO, CLAUSE.NO_PRICE, CLAUSE.NO_WEIGHT].join(",");
}

export function matchesFilter(issues: readonly QueueIssue[], filter: QueueFilter): boolean {
  if (filter === "ALL") return issues.length > 0;
  const want: QueueIssue = filter === "NO_PHOTO" ? "no_photo" : filter === "NO_PRICE" ? "no_price" : "no_weight";
  return issues.includes(want);
}

export function toQueueRow(r: QueueRowInput): QueueRow {
  const price = num(r.price);
  const stock = num(r.stock);
  return {
    ...r,
    price,
    stock: stock ?? 0,
    weight_grams: num(r.weight_grams),
    issues: queueIssues(r),
    purchasable: isPurchasable({ is_active: r.is_active, is_blocked: r.is_blocked, price, stock }),
  };
}

/** Urutan antrian: Hero dulu, lalu nama; id sebagai pemutus agar paginasi stabil. Sama dengan ORDER BY di server. */
export function compareQueueRows(
  a: Pick<QueueRowInput, "is_hero" | "name" | "id">,
  b: Pick<QueueRowInput, "is_hero" | "name" | "id">,
): number {
  const ha = a.is_hero === true ? 1 : 0;
  const hb = b.is_hero === true ? 1 : 0;
  if (ha !== hb) return hb - ha;
  const byName = a.name.localeCompare(b.name, "id");
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Pagar antrian tanpa mengubah urutan: hanya produk aktif & tidak diblokir yang punya masalah dan cocok filter.
 * Server memakai ini setelah query agar urutan dari database (dipakai paginasi) tidak berubah.
 */
export function filterQueue(rows: readonly QueueRowInput[], filter: QueueFilter = "ALL"): QueueRow[] {
  return rows
    .filter((r) => r.is_active && !r.is_blocked)
    .map(toQueueRow)
    .filter((r) => matchesFilter(r.issues, filter));
}

/** Antrian lengkap dari baris mentah: sama seperti filterQueue, lalu Hero lebih dulu. */
export function buildQueue(rows: readonly QueueRowInput[], filter: QueueFilter = "ALL"): QueueRow[] {
  return filterQueue(rows, filter).sort(compareQueueRows);
}

export function countByFilter(rows: readonly QueueRowInput[]): Record<QueueFilter, number> {
  const counts: Record<QueueFilter, number> = { ALL: 0, NO_PHOTO: 0, NO_PRICE: 0, NO_WEIGHT: 0 };
  for (const r of buildQueue(rows, "ALL")) {
    counts.ALL += 1;
    if (r.issues.includes("no_photo")) counts.NO_PHOTO += 1;
    if (r.issues.includes("no_price")) counts.NO_PRICE += 1;
    if (r.issues.includes("no_weight")) counts.NO_WEIGHT += 1;
  }
  return counts;
}

/** Offset halaman berikutnya, atau null bila sudah habis. */
export function nextOffset(offset: number, pageSize: number, total: number): number | null {
  const next = offset + pageSize;
  return next < total ? next : null;
}

export function clampOffset(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100_000);
}
