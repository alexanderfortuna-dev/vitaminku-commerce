// Pure planner for "Upload Massal" (Seller Center). The server runs it for the
// dry-run and again on apply, so the browser preview is never trusted.
import { parseIdrNumber, type RawCell } from "./bulk-price-stock";
import { MSG, isSampleSku, numberReadProblem } from "./import-messages";

export const FULL_HEADERS = [
  "SKU",
  "Nama",
  "Brand",
  "Kategori",
  "Deskripsi",
  "Harga",
  "Stok",
  "Berat_gram",
  "Panjang_cm",
  "Lebar_cm",
  "Tinggi_cm",
  "BPOM",
  "Foto_1",
  "Foto_2",
  "Foto_3",
  "Foto_4",
  "Foto_5",
  "Foto_6",
  "Foto_7",
  "Foto_8",
  "Foto_9",
  "Status",
] as const;

export const MAX_PHOTOS = 9;

export interface FullRow {
  row: number;
  sku: RawCell;
  nama: RawCell;
  brand: RawCell;
  kategori: RawCell;
  deskripsi: RawCell;
  harga: RawCell;
  stok: RawCell;
  berat: RawCell;
  /** Ukuran kemasan (cm). Kolom opsional di template; kosong = tidak diubah. */
  panjang?: RawCell;
  lebar?: RawCell;
  tinggi?: RawCell;
  bpom: RawCell;
  fotos: RawCell[];
  status: RawCell;
}

export interface ExistingProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string | null;
  price: number | null;
  stock: number;
  weight_grams: number | null;
  /** Hanya ada setelah migrasi 0018 dipasang (undefined = kolom belum ada). */
  length_cm?: number | string | null;
  width_cm?: number | string | null;
  height_cm?: number | string | null;
  bpom_number: string | null;
  images: string[];
  is_active: boolean;
  is_blocked: boolean;
}

export type ImportMode = "fill" | "overwrite";

export interface ProductPatch {
  name?: string;
  brand?: string;
  category?: string;
  description?: string;
  price?: number;
  stock?: number;
  weight_grams?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  bpom_number?: string;
}

export interface PlannedRow {
  row: number;
  sku: string;
  kind: "new" | "update";
  id: string | null;
  patch: ProductPatch;
  photos: string[]; // new photo URLs to download (replace gallery when set)
  publish: boolean | null; // null = leave status unchanged
  draftReason: string | null; // why it will stay Draf even though Live was asked
}

export interface IssueRow {
  row: number;
  sku: string;
  reason: string;
}

export interface FullPlan {
  totalRows: number;
  rows: PlannedRow[];
  unchanged: number;
  errors: IssueRow[];
  /** Written, but will stay Draf (listed in the error report too). */
  drafts: IssueRow[];
}

const text = (c: RawCell) => (c === null || c === undefined ? "" : String(c).trim());

export function parseStatus(c: RawCell): boolean | null | "invalid" {
  const s = text(c).toLowerCase();
  if (!s) return null;
  if (["live", "tampil", "tampilkan", "aktif", "active"].includes(s)) return true;
  if (["draf", "draft", "arsip", "arsipkan", "nonaktif"].includes(s)) return false;
  return "invalid";
}

/** Ukuran dalam cm: "30", "12.5" atau "12,5" (satu desimal, > 0, maks 300). Titik di sini desimal, bukan pemisah ribuan. */
export function parseCm(c: RawCell): { kind: "empty" } | { kind: "ok"; value: number } | { kind: "bad" } {
  const s = text(c).replace(/\s*cm$/i, "").replace(",", ".");
  if (!s) return { kind: "empty" };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return { kind: "bad" };
  const v = Math.round(Number(s) * 10) / 10;
  return v > 0 && v <= 300 ? { kind: "ok", value: v } : { kind: "bad" };
}

export function isPhotoUrl(s: string) {
  return /^https?:\/\/[^\s]+$/i.test(s) && s.length <= 1000;
}

/** Missing items for Live, mirroring public.publish_missing() in the database. */
export function publishMissing(p: {
  price: number | null;
  hasPhoto: boolean;
  stock: number | null;
  weight: number | null;
}): string[] {
  const out: string[] = [];
  if (p.price === null || !(p.price > 0)) out.push("tanpa harga");
  if (!p.hasPhoto) out.push("tanpa foto");
  if (p.stock === null || p.stock < 0) out.push("stok tidak valid");
  if (p.weight === null || !(p.weight > 0)) out.push("tanpa berat");
  return out;
}

/**
 * @param blocked per input row index: blocked reason ("" = not blocked), computed by the DB.
 */
export function planFullImport(
  input: FullRow[],
  products: ExistingProduct[],
  mode: ImportMode,
  blocked: string[] = [],
): FullPlan {
  const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
  const seen = new Set<string>();
  const plan: FullPlan = { totalRows: 0, rows: [], unchanged: 0, errors: [], drafts: [] };

  input.forEach((r, index) => {
    const sku = text(r.sku);
    const cells = [r.nama, r.brand, r.kategori, r.deskripsi, r.harga, r.stok, r.berat, r.panjang, r.lebar, r.tinggi, r.bpom, r.status, ...r.fotos];
    if (!sku && cells.every((c) => text(c) === "")) return;
    plan.totalRows++;
    if (!sku) return void plan.errors.push({ row: r.row, sku: "", reason: MSG.skuEmpty });
    if (isSampleSku(sku)) return void plan.errors.push({ row: r.row, sku, reason: MSG.sample });
    const key = sku.toLowerCase();
    if (seen.has(key)) return void plan.errors.push({ row: r.row, sku, reason: MSG.skuDuplicate });
    seen.add(key);

    const existing = bySku.get(key) ?? null;
    const reasons: string[] = [];
    const blockReason = blocked[index] ?? "";
    if (blockReason) reasons.push(MSG.blocked(blockReason));

    const price = parseIdrNumber(r.harga);
    const stock = parseIdrNumber(r.stok);
    const weight = parseIdrNumber(r.berat);
    const priceBad = numberReadProblem("Harga", "125000", price, text(r.harga));
    const stockBad = numberReadProblem("Stok", "10", stock, text(r.stok));
    const weightBad = numberReadProblem("Berat_gram", "250", weight, text(r.berat));
    if (priceBad) reasons.push(priceBad);
    if (price.kind === "ok" && Math.round(price.value) <= 0) reasons.push(MSG.priceZero);
    if (stockBad) reasons.push(stockBad);
    if (stock.kind === "ok" && !Number.isInteger(stock.value)) reasons.push(MSG.stockFraction);
    if (weightBad) reasons.push(weightBad);
    if (weight.kind === "ok" && !(Math.round(weight.value) > 0)) reasons.push(MSG.weightZero);
    const dims = [parseCm(r.panjang), parseCm(r.lebar), parseCm(r.tinggi)];
    const dimLabels = ["Panjang_cm", "Lebar_cm", "Tinggi_cm"];
    dims.forEach((d, i) => { if (d.kind === "bad") reasons.push(MSG.dimBad(dimLabels[i]!)); });
    const dimsFilled = dims.filter((d) => d.kind === "ok").length;
    if (!dims.some((d) => d.kind === "bad") && dimsFilled > 0 && dimsFilled < 3) reasons.push(MSG.dimPartial);
    const status = parseStatus(r.status);
    if (status === "invalid") reasons.push(MSG.status(text(r.status)));

    const photos = r.fotos.map(text).filter(Boolean);
    const badPhoto = photos.find((u) => !isPhotoUrl(u));
    if (badPhoto) reasons.push(MSG.photo(badPhoto));
    if (photos.length > MAX_PHOTOS) reasons.push(MSG.maxPhotos(MAX_PHOTOS));

    const nama = text(r.nama);
    const brand = text(r.brand);
    const kategori = text(r.kategori);
    if (!existing) {
      if (!nama) reasons.push(MSG.newRequired("Nama"));
      if (!brand) reasons.push(MSG.newRequired("Brand"));
      if (!kategori) reasons.push(MSG.newRequired("Kategori"));
    }

    if (reasons.length) return void plan.errors.push({ row: r.row, sku, reason: reasons.join(" ") });

    const patch: ProductPatch = {};
    const take = <K extends keyof ProductPatch>(k: K, next: ProductPatch[K], current: unknown, isEmpty: boolean) => {
      if (next === undefined || next === "") return;
      if (existing && mode === "fill" && !isEmpty) return;
      if (existing && current === next) return;
      patch[k] = next;
    };
    const cur = existing;
    take("name", nama || undefined, cur?.name, !cur?.name);
    take("brand", brand || undefined, cur?.brand, !cur?.brand);
    take("category", kategori || undefined, cur?.category, !cur?.category);
    take("description", text(r.deskripsi) || undefined, cur?.description, !cur?.description);
    take("bpom_number", text(r.bpom) || undefined, cur?.bpom_number, !cur?.bpom_number);
    take("price", price.kind === "ok" ? Math.round(price.value) : undefined, cur?.price == null ? null : Number(cur.price), cur?.price == null);
    take("stock", stock.kind === "ok" ? stock.value : undefined, cur?.stock, !cur || cur.stock === 0);
    take("weight_grams", weight.kind === "ok" ? Math.round(weight.value) : undefined, cur?.weight_grams, cur?.weight_grams == null);
    if (dimsFilled === 3) {
      // Tiga ukuran satu paket: dalam mode isi-yang-kosong, ditulis hanya bila produk belum punya ukuran sama sekali.
      const curDims = [cur?.length_cm, cur?.width_cm, cur?.height_cm].map((v) => (v == null ? null : Number(v)));
      const none = curDims.every((v) => v === null);
      const same = curDims.every((v, i) => v === (dims[i] as { value: number }).value);
      if (!(cur && mode === "fill" && !none) && !(cur && same)) {
        patch.length_cm = (dims[0] as { value: number }).value;
        patch.width_cm = (dims[1] as { value: number }).value;
        patch.height_cm = (dims[2] as { value: number }).value;
      }
    }

    const hasPhotos = (cur?.images.length ?? 0) > 0;
    const newPhotos =
      photos.length === 0 || (cur && mode === "fill" && hasPhotos) ||
      (cur && photos.join("\n") === cur.images.join("\n"))
        ? []
        : photos;

    const publish = status === true ? (cur?.is_active ? null : true) : status === false ? (cur?.is_active === false ? null : false) : null;

    let draftReason: string | null = null;
    if (status === true) {
      const missing = publishMissing({
        price: patch.price ?? (cur?.price == null ? null : Number(cur.price)),
        hasPhoto: hasPhotos || newPhotos.length > 0,
        stock: patch.stock ?? cur?.stock ?? 0,
        weight: patch.weight_grams ?? cur?.weight_grams ?? null,
      });
      if (missing.length && !cur?.is_active) {
        draftReason = MSG.draft(missing);
        plan.drafts.push({ row: r.row, sku, reason: draftReason });
      }
    }

    if (cur && Object.keys(patch).length === 0 && newPhotos.length === 0 && publish === null) {
      plan.unchanged++;
      return;
    }
    plan.rows.push({
      row: r.row,
      sku,
      kind: cur ? "update" : "new",
      id: cur?.id ?? null,
      patch,
      photos: newPhotos,
      publish,
      draftReason,
    });
  });
  return plan;
}

/** Header-located grid → FullRow[]. Header names are case-insensitive. */
export function gridToFullRows(grid: RawCell[][]): FullRow[] {
  const header = (grid[0] ?? []).map((h) => text(h).toLowerCase());
  const idx = (n: string) => header.indexOf(n.toLowerCase());
  if (idx("SKU") < 0) throw new Error("Kolom 'SKU' tidak ditemukan di baris pertama.");
  const at = (cells: RawCell[], n: string) => (idx(n) >= 0 ? cells[idx(n)] : undefined);
  return grid.slice(1).map((cells, n) => ({
    row: n + 2,
    sku: at(cells, "SKU"),
    nama: at(cells, "Nama"),
    brand: at(cells, "Brand"),
    kategori: at(cells, "Kategori"),
    deskripsi: at(cells, "Deskripsi"),
    harga: at(cells, "Harga"),
    stok: at(cells, "Stok"),
    berat: at(cells, "Berat_gram"),
    panjang: at(cells, "Panjang_cm") ?? at(cells, "Panjang"),
    lebar: at(cells, "Lebar_cm") ?? at(cells, "Lebar"),
    tinggi: at(cells, "Tinggi_cm") ?? at(cells, "Tinggi"),
    bpom: at(cells, "BPOM"),
    fotos: Array.from({ length: MAX_PHOTOS }, (_, i) => at(cells, `Foto_${i + 1}`)),
    status: at(cells, "Status"),
  }));
}

/** SKU from a photo file name: "ABC-1.jpg" → {sku:"ABC-1", order:1}; "ABC-1_2.webp" → order 2. */
export function skuFromPhotoName(fileName: string): { sku: string; order: number } | null {
  const base = fileName.split("/").pop() ?? "";
  if (base.startsWith(".") || !/\.(jpe?g|png|webp)$/i.test(base)) return null;
  const stem = base.replace(/\.[^.]+$/, "");
  const m = stem.match(/^(.+)_(\d)$/);
  if (m) return { sku: m[1]!, order: Number(m[2]) };
  return stem ? { sku: stem, order: 1 } : null;
}
