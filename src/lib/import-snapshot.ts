// Snapshot sebelum Upload Massal: kunci `before` HARUS sama dengan yang dipulihkan RPC
// public.undo_product_import (drizzle/migrations/0013_import_undo.sql). Kolom biaya modal tidak pernah ikut.
import type { PlannedRow } from "./seller-import";

export const SNAPSHOT_KEYS = [
  "name",
  "brand",
  "category",
  "subcategory",
  "size",
  "pack_count",
  "servings",
  "dose",
  "flavor",
  "description",
  "price",
  "compare_at_price",
  "stock",
  "weight_grams",
  "bpom_number",
  "images",
  "is_active",
  "variant_group",
] as const;

/** Daftar kolom untuk .select() — id & sku dibutuhkan untuk mencocokkan baris. */
export const SNAPSHOT_SELECT = `id,sku,${SNAPSHOT_KEYS.join(",")}`;

export interface SnapshotRow {
  import_id: string;
  sku: string;
  existed: boolean;
  before: Record<string, unknown> | null;
}

/** Hanya kunci yang dipulihkan RPC; kolom lain (mis. biaya modal) dibuang. */
export function pickBefore(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_KEYS) out[k] = row[k] === undefined ? null : row[k];
  return out;
}

/**
 * Satu baris snapshot per SKU yang akan disentuh. Produk lama: existed=true + isi sebelum diubah (SKU memakai
 * penulisan di database). Produk baru: existed=false (saat dibatalkan, diarsipkan, tidak dihapus).
 * @throws bila produk lama yang direncanakan tidak ditemukan — impor tidak boleh jalan tanpa cadangan.
 */
export function buildSnapshotRows(
  importId: string,
  planned: Pick<PlannedRow, "kind" | "id" | "sku">[],
  beforeById: Map<string, Record<string, unknown>>,
): SnapshotRow[] {
  return planned.map((r) => {
    if (r.kind === "new") return { import_id: importId, sku: r.sku, existed: false, before: null };
    const cur = r.id ? beforeById.get(r.id) : undefined;
    if (!cur) throw new Error(`Produk ${r.sku} tidak ditemukan saat membuat cadangan.`);
    return { import_id: importId, sku: String(cur["sku"] ?? r.sku), existed: true, before: pickBefore(cur) };
  });
}
