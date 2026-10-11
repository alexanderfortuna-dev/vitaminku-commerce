// Pure parsing/validation for the bulk price & stock import. Used by the server
// for both the dry-run preview and the save, so both always agree.

export const TEMPLATE_HEADERS = [
  "sku",
  "nama_produk",
  "merek",
  "kategori",
  "harga_jual",
  "harga_coret",
  "stok",
] as const;

export type RawCell = string | number | null | undefined;
export interface RawRow {
  row: number; // spreadsheet row number (header = 1)
  sku: RawCell;
  harga_jual: RawCell;
  harga_coret: RawCell;
  stok: RawCell;
}

export interface CurrentProduct {
  id: string;
  sku: string;
  name: string;
  price: number | null;
  compare_at_price: number | null;
  stock: number;
}

export type ParseResult = { kind: "empty" } | { kind: "ok"; value: number } | { kind: "error"; message: string };

/** Parses "Rp 125.000", "125.000", "125000", "125.000,50", or numeric cells. Empty = leave unchanged. */
export function parseIdrNumber(input: RawCell): ParseResult {
  if (input === null || input === undefined) return { kind: "empty" };
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { kind: "error", message: "bukan angka" };
    return input < 0 ? { kind: "error", message: "angka negatif" } : { kind: "ok", value: input };
  }
  let s = String(input).trim();
  if (s === "") return { kind: "empty" };
  s = s.replace(/^rp\.?/i, "").replace(/[\s ]/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  let normalized: string | null = null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)?$/.test(s)) normalized = s.replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(s)) normalized = s; // "125000.50" from numeric exports
  if (normalized === null) return { kind: "error", message: `bukan angka ("${String(input)}")` };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { kind: "error", message: "bukan angka" };
  if (negative && value !== 0) return { kind: "error", message: "angka negatif" };
  return { kind: "ok", value };
}

export interface RowError {
  row: number;
  sku: string;
  reason: string;
}

export interface PlannedUpdate {
  id: string;
  sku: string;
  patch: { price?: number; compare_at_price?: number; stock?: number };
}

export interface ImportPlan {
  updates: PlannedUpdate[];
  unchanged: number;
  unknownSku: RowError[];
  invalid: RowError[];
  totalRows: number;
}

export function planImport(rows: RawRow[], products: CurrentProduct[]): ImportPlan {
  const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
  const seen = new Set<string>();
  const plan: ImportPlan = { updates: [], unchanged: 0, unknownSku: [], invalid: [], totalRows: 0 };

  for (const r of rows) {
    const sku = r.sku === null || r.sku === undefined ? "" : String(r.sku).trim();
    const allEmpty = [r.harga_jual, r.harga_coret, r.stok].every(
      (c) => c === null || c === undefined || String(c).trim() === "",
    );
    if (!sku && allEmpty) continue; // blank line
    plan.totalRows++;
    if (!sku) {
      plan.invalid.push({ row: r.row, sku: "", reason: "SKU kosong" });
      continue;
    }
    const key = sku.toLowerCase();
    if (seen.has(key)) {
      plan.invalid.push({ row: r.row, sku, reason: "SKU muncul lebih dari sekali di file" });
      continue;
    }
    seen.add(key);
    const product = bySku.get(key);
    if (!product) {
      plan.unknownSku.push({ row: r.row, sku, reason: "SKU tidak ditemukan" });
      continue;
    }

    const reasons: string[] = [];
    const price = parseIdrNumber(r.harga_jual);
    const compare = parseIdrNumber(r.harga_coret);
    const stock = parseIdrNumber(r.stok);
    if (price.kind === "error") reasons.push(`harga_jual ${price.message}`);
    if (compare.kind === "error") reasons.push(`harga_coret ${compare.message}`);
    if (stock.kind === "error") reasons.push(`stok ${stock.message}`);
    if (price.kind === "ok" && Math.round(price.value) <= 0) reasons.push("harga_jual tidak boleh 0");
    if (stock.kind === "ok" && !Number.isInteger(stock.value)) reasons.push("stok harus bilangan bulat");

    const newPrice = price.kind === "ok" ? Math.round(price.value) : product.price;
    const newCompare = compare.kind === "ok" ? Math.round(compare.value) : product.compare_at_price;
    if (compare.kind === "ok") {
      if (newCompare === 0) reasons.push("harga_coret tidak boleh 0");
      else if (newPrice === null) reasons.push("harga_coret butuh harga_jual");
      else if ((newCompare ?? 0) <= newPrice) reasons.push("harga_coret harus lebih besar dari harga_jual");
    } else if (price.kind === "ok" && newCompare !== null && newCompare <= (newPrice ?? 0)) {
      reasons.push("harga_jual baru tidak lebih kecil dari harga_coret yang ada");
    }

    if (reasons.length) {
      plan.invalid.push({ row: r.row, sku, reason: reasons.join("; ") });
      continue;
    }

    const patch: PlannedUpdate["patch"] = {};
    if (price.kind === "ok" && Number(product.price) !== newPrice) patch.price = newPrice!;
    if (compare.kind === "ok" && Number(product.compare_at_price) !== newCompare)
      patch.compare_at_price = newCompare!;
    if (stock.kind === "ok" && product.stock !== stock.value) patch.stock = stock.value;
    if (Object.keys(patch).length === 0) plan.unchanged++;
    else plan.updates.push({ id: product.id, sku: product.sku, patch });
  }
  return plan;
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Minimal CSV parser: quoted fields, "," or ";" delimiter (auto-detected from header). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Turns a grid (header row first) into RawRows, locating columns by header name. */
export function gridToRows(grid: RawCell[][]): RawRow[] {
  const header = (grid[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iSku = idx("sku");
  if (iSku < 0) throw new Error("Kolom 'sku' tidak ditemukan di baris pertama.");
  const iPrice = idx("harga_jual") >= 0 ? idx("harga_jual") : idx("harga");
  const iCompare = idx("harga_coret");
  const iStock = idx("stok");
  return grid.slice(1).map((cells, n) => ({
    row: n + 2,
    sku: cells[iSku],
    harga_jual: iPrice >= 0 ? cells[iPrice] : undefined,
    harga_coret: iCompare >= 0 ? cells[iCompare] : undefined,
    stok: iStock >= 0 ? cells[iStock] : undefined,
  }));
}
