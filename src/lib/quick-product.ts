// Logika murni "Tambah Produk Cepat": validasi isian, SKU sementara, dan penerjemah galat database.
import { hasPermission } from "./permissions";
import type { AdminRole } from "./admin-roles";

export interface QuickProductInput {
  name: string;
  brand: string;
  category: string;
  price?: string | undefined;
  stock?: string | undefined;
  weight_grams?: string | undefined;
  sku?: string | undefined;
}

export interface QuickProductClean {
  name: string;
  brand: string;
  category: string;
  price: number | null;
  stock: number;
  weight_grams: number | null;
  sku: string | null;
}

/** Hanya angka; kosong = null. Di bawah `min` dianggap tidak valid. */
export function parseWhole(value: unknown, label: string, min: number): number | null {
  if (value === undefined || value === null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits === "") return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`${label} tidak valid.`);
  return n;
}

/**
 * Memeriksa isian dan izin. Harga/stok butuh `products_price_stock`, berat butuh `products_weight`
 * (sama dengan peran manajer ke atas); isian tanpa izin ditolak, bukan diam-diam dibuang.
 */
export function cleanQuickProduct(input: QuickProductInput, role: AdminRole | null): QuickProductClean {
  const name = String(input?.name ?? "").trim();
  const brand = String(input?.brand ?? "").trim();
  const category = String(input?.category ?? "").trim();
  if (!name) throw new Error("Nama produk wajib diisi.");
  if (name.length > 200) throw new Error("Nama produk terlalu panjang.");
  if (!brand) throw new Error("Merek wajib dipilih.");
  if (!category) throw new Error("Kategori wajib dipilih.");

  const price = parseWhole(input.price, "Harga", 1);
  const stock = parseWhole(input.stock, "Stok", 0);
  const weight = parseWhole(input.weight_grams, "Berat", 1);

  if ((price !== null || stock !== null) && !hasPermission({ role }, "products_price_stock")) {
    throw new Error("403 — harga dan stok hanya bisa diisi manajer/owner.");
  }
  if (weight !== null && !hasPermission({ role }, "products_weight")) {
    throw new Error("403 — berat hanya bisa diisi manajer/owner.");
  }

  const sku = String(input.sku ?? "").trim();
  return { name, brand, category, price, stock: stock ?? 0, weight_grams: weight, sku: sku || null };
}

const SKU_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** SKU sementara "QC-YYMMDD-XXXXX" bila staf tidak mengisi SKU. Unik dijaga database; staf bisa menggantinya nanti. */
export function temporarySku(now: Date = new Date(), random: () => number = Math.random): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  let tail = "";
  for (let i = 0; i < 5; i += 1) tail += SKU_CHARS[Math.floor(random() * SKU_CHARS.length)];
  return `QC-${yy}${mm}${dd}-${tail}`;
}

export type InsertErrorKind = "sku" | "slug" | "permission" | "other";

export function classifyInsertError(message: string): InsertErrorKind {
  const m = message.toLowerCase();
  if (/row-level security|permission denied|42501/.test(m)) return "permission";
  if (/duplicate|unique/.test(m)) {
    if (/slug/.test(m)) return "slug";
    return "sku";
  }
  return "other";
}

export function insertErrorMessage(kind: InsertErrorKind, raw: string, sku: string): string {
  switch (kind) {
    case "permission":
      return "Akun ini belum bisa membuat produk baru. Minta admin/owner membuatnya, lalu lengkapi foto lewat Antrian Kerja.";
    case "slug":
      return "Nama ini sudah dipakai produk lain. Tambahkan rasa atau ukuran pada nama.";
    case "sku":
      return `SKU ${sku} sudah dipakai.`;
    default:
      return `Database menolak produk: ${raw}`;
  }
}
