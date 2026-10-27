// Seller Center (owner/admin). Every product write runs as the signed-in user, so
// RLS and the products_guard trigger (blocklist + publish rule) stay in force.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requirePermission, requireRole, type Ctx } from "./admin.functions";
import {
  MAX_PHOTOS,
  planFullImport,
  type ExistingProduct,
  type FullRow,
  type ImportMode,
  type PlannedRow,
} from "./seller-import";
import type { RawCell } from "./bulk-price-stock";
import { SNAPSHOT_SELECT, buildSnapshotRows } from "./import-snapshot";

export const SELLER_PAGE_SIZE = 50;
export type SellerTab = "ALL" | "LIVE" | "DRAFT" | "INCOMPLETE" | "OUT" | "BLOCKED";
export const SELLER_TABS: SellerTab[] = ["ALL", "LIVE", "DRAFT", "INCOMPLETE", "OUT", "BLOCKED"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (ctx: Ctx): any => ctx.supabase;
const asCtx = (c: unknown) => c as Ctx;

export interface SellerRow {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: number | null;
  stock: number;
  weight_grams: number | null;
  image_url: string | null;
  is_active: boolean;
  is_blocked: boolean;
  blocked_reason: string | null;
  publish_issue: string | null;
}
const ROW_COLS =
  "id,sku,name,brand,category,price,stock,weight_grams,image_url,is_active,is_blocked,blocked_reason,publish_issue";

export function missingItems(p: Pick<SellerRow, "price" | "image_url" | "weight_grams" | "stock">): string[] {
  const out: string[] = [];
  if (p.price == null || Number(p.price) <= 0) out.push("tanpa harga");
  if (!p.image_url) out.push("tanpa foto");
  if (p.weight_grams == null) out.push("tanpa berat");
  return out;
}

function clean(s: string) {
  return s.replace(/[%_,()*\\]/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyTab(q: any, tab: SellerTab) {
  switch (tab) {
    case "LIVE":
      return q.eq("is_active", true);
    case "DRAFT":
      return q.eq("is_active", false).eq("is_blocked", false);
    case "INCOMPLETE":
      return q.eq("is_blocked", false).or("price.is.null,image_url.is.null,weight_grams.is.null");
    case "OUT":
      return q.eq("is_blocked", false).eq("stock", 0);
    case "BLOCKED":
      return q.eq("is_blocked", true);
    default:
      return q;
  }
}

type ListInput = { tab?: SellerTab; search?: string; brand?: string; category?: string; page?: number };

export const listSellerProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: ListInput) => ({
    tab: SELLER_TABS.includes(i?.tab as SellerTab) ? (i.tab as SellerTab) : "ALL",
    search: clean(String(i?.search ?? "")).slice(0, 80),
    brand: String(i?.brand ?? "").slice(0, 120),
    category: String(i?.category ?? "").slice(0, 120),
    page: Math.max(0, Math.floor(Number(i?.page ?? 0)) || 0),
  }))
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = (q: any) => {
      if (data.search) q = q.or(`name.ilike.%${data.search}%,sku.ilike.%${data.search}%`);
      if (data.brand) q = q.eq("brand", data.brand);
      if (data.category) q = q.eq("category", data.category);
      return q;
    };
    const countFor = async (tab: SellerTab) => {
      const { count, error } = await applyTab(
        filtered(db(ctx).from("products").select("id", { count: "exact", head: true })),
        tab,
      );
      if (error) throw new Error(error.message);
      return (count as number) ?? 0;
    };
    const from = data.page * SELLER_PAGE_SIZE;
    const [list, ...counts] = await Promise.all([
      applyTab(filtered(db(ctx).from("products").select(ROW_COLS)), data.tab)
        .order("name")
        .range(from, from + SELLER_PAGE_SIZE - 1),
      ...SELLER_TABS.map(countFor),
    ]);
    if (list.error) throw new Error(list.error.message);
    const tabCounts = Object.fromEntries(SELLER_TABS.map((t, i) => [t, counts[i] as number])) as Record<
      SellerTab,
      number
    >;
    return {
      products: ((list.data ?? []) as SellerRow[]).map((p) => ({
        ...p,
        price: p.price == null ? null : Number(p.price),
        missing: missingItems(p),
      })),
      counts: tabCounts,
      total: tabCounts[data.tab],
      pageSize: SELLER_PAGE_SIZE,
    };
  });

export const getSellerFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    const brands = new Set<string>();
    const categories = new Set<string>();
    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data, error } = await db(ctx).from("products").select("brand,category").range(offset, offset + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        if (r.brand) brands.add(r.brand);
        if (r.category) categories.add(r.category);
      }
      if (!data || data.length < 1000) break;
    }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "id"));
    return { brands: sort(brands), categories: sort(categories) };
  });

export const bulkSellerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { ids: string[]; action: "publish" | "archive" | "stock"; stock?: number }) => {
    if (!Array.isArray(i?.ids) || i.ids.length === 0) throw new Error("Tidak ada produk dipilih.");
    if (!["publish", "archive", "stock"].includes(i.action)) throw new Error("Aksi tidak valid.");
    const stock = Math.floor(Number(i.stock));
    if (i.action === "stock" && (!Number.isFinite(stock) || stock < 0 || stock > 100000))
      throw new Error("Stok tidak valid.");
    return { ids: i.ids.slice(0, 100).map(String), action: i.action, stock };
  })
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    const patch =
      data.action === "publish" ? { is_active: true } : data.action === "archive" ? { is_active: false } : { stock: data.stock };
    const { data: rows, error } = await db(ctx)
      .from("products")
      .update(patch)
      .in("id", data.ids)
      .select("id,sku,name,is_active,is_blocked,publish_issue");
    if (error) throw new Error(`Database menolak perubahan: ${error.message}`);
    const list = (rows ?? []) as Array<{ sku: string; name: string; is_active: boolean; publish_issue: string | null }>;
    const notLive =
      data.action === "publish"
        ? list.filter((r) => !r.is_active).map((r) => ({ sku: r.sku, name: r.name, reason: r.publish_issue ?? "Tidak bisa tampil" }))
        : [];
    await audit(ctx, `seller_bulk_${data.action}`, null, { count: list.length, notLive: notLive.length, stock: data.stock });
    return { updated: list.length, live: list.filter((r) => r.is_active).length, notLive };
  });

// ---------- product form ----------

export interface NewProductInput {
  name: string;
  brand: string;
  category: string;
  subcategory?: string | undefined;
  description?: string | undefined;
  bpom_number?: string | undefined;
  sku: string;
  price?: string | undefined;
  stock?: string | undefined;
  weight_grams?: string | undefined;
  flavor?: string | undefined;
  size?: string | undefined;
  variant_group?: string | null | undefined;
}

function intOrNull(v: unknown, label: string, min = 0): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Math.floor(Number(String(v).replace(/\D/g, "")));
  if (!Number.isFinite(n) || n < min) throw new Error(`${label} tidak valid.`);
  return n;
}

async function insertProduct(ctx: Ctx, input: NewProductInput, extra: Record<string, unknown> = {}) {
  const { data: row, error } = await db(ctx)
    .from("products")
    .insert({
      name: input.name.trim(),
      brand: input.brand.trim(),
      category: input.category.trim() || "Lain-lain (Non-Suplemen)",
      subcategory: input.subcategory?.trim() || "Lainnya",
      description: input.description?.trim() || null,
      bpom_number: input.bpom_number?.trim() || null,
      sku: input.sku.trim(),
      price: intOrNull(input.price, "Harga", 1),
      stock: intOrNull(input.stock, "Stok") ?? 0,
      weight_grams: intOrNull(input.weight_grams, "Berat", 1),
      flavor: input.flavor?.trim() || null,
      size: input.size?.trim() || null,
      variant_group: input.variant_group ?? null,
      is_active: false,
      ...extra,
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error(`SKU ${input.sku} sudah dipakai.`);
    throw new Error(`Database menolak produk: ${error.message}`);
  }
  return row.id as string;
}

export const createSellerProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: NewProductInput) => {
    if (!i?.name?.trim()) throw new Error("Nama produk wajib diisi.");
    if (!i.sku?.trim()) throw new Error("SKU wajib diisi.");
    if (!i.brand?.trim()) throw new Error("Brand wajib diisi.");
    return i;
  })
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    const id = await insertProduct(ctx, data);
    await audit(ctx, "db_product_create", id, { sku: data.sku });
    return { id };
  });

export const listVariants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: String(i?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "seller");
    const { data: me } = await db(ctx).from("products").select("id,variant_group").eq("id", data.id).maybeSingle();
    if (!me?.variant_group) return { variants: [] as Array<SellerRow & { flavor: string | null; size: string | null }> };
    const { data: rows, error } = await db(ctx)
      .from("products")
      .select(`${ROW_COLS},flavor,size`)
      .eq("variant_group", me.variant_group)
      .order("sku");
    if (error) throw new Error(error.message);
    return { variants: (rows ?? []) as Array<SellerRow & { flavor: string | null; size: string | null }> };
  });

export const createVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { fromId: string; sku: string; flavor?: string; size?: string; price?: string; stock?: string; weight_grams?: string }) => {
      if (!i?.fromId || !i.sku?.trim()) throw new Error("SKU varian wajib diisi.");
      if (!i.flavor?.trim() && !i.size?.trim()) throw new Error("Isi rasa atau ukuran varian.");
      return i;
    },
  )
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    const { data: src, error } = await db(ctx)
      .from("products")
      .select("id,name,brand,category,subcategory,description,bpom_number,images,variant_group,weight_grams")
      .eq("id", data.fromId)
      .maybeSingle();
    if (error || !src) throw new Error("Produk asal tidak ditemukan.");
    const group = src.variant_group ?? src.id;
    if (!src.variant_group) await db(ctx).from("products").update({ variant_group: group }).eq("id", src.id);
    const id = await insertProduct(
      ctx,
      {
        // slug is generated from the name, so a variant needs its own name.
        name: [src.name, data.flavor?.trim(), data.size?.trim()].filter(Boolean).join(" "),
        brand: src.brand,
        category: src.category,
        subcategory: src.subcategory,
        description: src.description ?? undefined,
        bpom_number: src.bpom_number ?? undefined,
        sku: data.sku,
        flavor: data.flavor,
        size: data.size,
        price: data.price,
        stock: data.stock,
        weight_grams: data.weight_grams || (src.weight_grams ? String(src.weight_grams) : undefined),
        variant_group: group,
      },
      { images: src.images ?? [] },
    );
    await audit(ctx, "db_variant_create", id, { sku: data.sku, from: src.id });
    return { id };
  });

// ---------- photos ----------

const BUCKET = "product-images";

export async function storeProductImage(productId: string, bytes: Uint8Array, _contentType: string) {
  // Semua foto yang masuk lewat jalur ini diberi watermark VitaminKu dan disimpan sebagai WebP (maks 1200 px).
  const { processUpload } = await import("./photo-process.server");
  const stamped = await processUpload(bytes);
  const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, stamped, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`Upload gambar gagal: ${error.message}`);
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signError || !signed) throw new Error("Link gambar gagal dibuat.");
  return signed.signedUrl;
}

async function readImages(ctx: Ctx, id: string): Promise<string[]> {
  const { data, error } = await db(ctx).from("products").select("images").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Produk tidak ditemukan.");
  return (data.images ?? []) as string[];
}

async function writeImages(ctx: Ctx, id: string, images: string[]) {
  const { error } = await db(ctx).from("products").update({ images: images.slice(0, MAX_PHOTOS) }).eq("id", id);
  if (error) throw new Error(`Database menolak perubahan: ${error.message}`);
}

export const setProductImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; images: string[] }) => {
    if (!i?.id || !Array.isArray(i.images)) throw new Error("Data foto tidak valid.");
    return { id: String(i.id), images: i.images.map(String).slice(0, MAX_PHOTOS) };
  })
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "seller");
    // Only reorder/remove photos that are already on this product.
    const current = new Set(await readImages(ctx, data.id));
    const next = data.images.filter((u) => current.has(u));
    await writeImages(ctx, data.id, next);
    await audit(ctx, "db_images_set", data.id, { count: next.length });
    return { images: next };
  });

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[)/i;

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; type: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("URL tidak valid");
  }
  if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) throw new Error("URL tidak diizinkan");
  const res = await fetch(u.toString(), { signal: AbortSignal.timeout(15000), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!/^image\/(jpeg|jpg|png|webp)$/.test(type)) throw new Error(`bukan gambar (${type || "tanpa tipe"})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > 8_000_000) throw new Error("gambar > 8 MB");
  if (buf.byteLength < 200) throw new Error("gambar kosong");
  return { bytes: buf, type: type === "image/jpg" ? "image/jpeg" : type };
}

/** Downloads photo URLs server-side, re-hosts them in Storage, then optionally publishes. */
export const importProductPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; urls: string[]; replace: boolean; publish: boolean }) => {
    if (!i?.id || !Array.isArray(i.urls)) throw new Error("Data foto tidak valid.");
    return { id: String(i.id), urls: i.urls.map(String).slice(0, MAX_PHOTOS), replace: !!i.replace, publish: !!i.publish };
  })
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    const stored: string[] = [];
    const failed: Array<{ url: string; reason: string }> = [];
    for (const url of data.urls) {
      try {
        const img = await downloadImage(url);
        stored.push(await storeProductImage(data.id, img.bytes, img.type));
      } catch (e) {
        failed.push({ url, reason: e instanceof Error ? e.message : "gagal" });
      }
    }
    if (stored.length) {
      const base = data.replace ? [] : await readImages(ctx, data.id);
      await writeImages(ctx, data.id, [...base, ...stored]);
    }
    let live = false;
    let issue: string | null = null;
    if (data.publish && failed.length === 0) {
      const { data: row, error } = await db(ctx)
        .from("products")
        .update({ is_active: true })
        .eq("id", data.id)
        .select("is_active,publish_issue")
        .maybeSingle();
      if (error) issue = error.message;
      live = !!row?.is_active;
      issue = issue ?? row?.publish_issue ?? null;
    } else if (data.publish) {
      issue = "Tetap Draf: ada foto yang gagal diunduh";
    }
    return { stored: stored.length, failed, live, issue };
  });

/** Uploads one browser-compressed photo and appends it to the gallery (max 9). */
export const addProductPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; file: { name: string; type: string; base64: string } }) => {
    if (!i?.id || !i.file?.base64) throw new Error("Tidak ada gambar dipilih.");
    if (!/^image\/(jpeg|png|webp)$/.test(i.file.type)) throw new Error("Format gambar tidak didukung.");
    if (i.file.base64.length > 7_000_000) throw new Error("Gambar terlalu besar (maks ±5 MB).");
    return i;
  })
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "seller");
    const images = await readImages(ctx, data.id);
    if (images.length >= MAX_PHOTOS) throw new Error(`Maksimal ${MAX_PHOTOS} foto per produk.`);
    const bytes = Uint8Array.from(atob(data.file.base64), (c) => c.charCodeAt(0));
    const url = await storeProductImage(data.id, bytes, data.file.type);
    await writeImages(ctx, data.id, [...images, url]);
    await audit(ctx, "db_image_upload", data.id, { count: images.length + 1 });
    return { url, count: images.length + 1 };
  });

export const lookupSkus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { skus: string[] }) => ({ skus: (i?.skus ?? []).map(String).slice(0, 2000) }))
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    const out: Array<{ id: string; sku: string; photos: number }> = [];
    for (let i = 0; i < data.skus.length; i += 200) {
      const { data: rows, error } = await db(ctx)
        .from("products")
        .select("id,sku,images")
        .in("sku", data.skus.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) out.push({ id: r.id, sku: r.sku, photos: (r.images ?? []).length });
    }
    return { products: out };
  });

// ---------- Upload Massal ----------

const FULL_COLS = "id,sku,name,brand,category,description,price,stock,weight_grams,bpom_number,images,is_active,is_blocked";
const DIM_COLS = "length_cm,width_cm,height_cm";
const MSG_DIMS_NOT_READY = "Ukuran belum bisa disimpan: pembaruan database 0018 belum dipasang (jalankan mode pasang-database).";

// Kolom ukuran baru ada setelah migrasi 0018. Sebelum itu impor tetap jalan tanpa ukuran (cek sekali per menit).
let dimsProbe: { at: number; ok: boolean } | null = null;
async function dimsSupported(ctx: Ctx): Promise<boolean> {
  if (dimsProbe && Date.now() - dimsProbe.at < 60_000) return dimsProbe.ok;
  const { error } = await db(ctx).from("products").select("length_cm").limit(1);
  dimsProbe = { at: Date.now(), ok: !error };
  return dimsProbe.ok;
}

async function loadBySku(ctx: Ctx, skus: string[]): Promise<ExistingProduct[]> {
  const out: ExistingProduct[] = [];
  const unique = [...new Set(skus.filter(Boolean))];
  const cols = (await dimsSupported(ctx)) ? `${FULL_COLS},${DIM_COLS}` : FULL_COLS;
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db(ctx).from("products").select(cols).in("sku", unique.slice(i, i + 200));
    if (error) throw new Error(`Gagal membaca produk: ${error.message}`);
    out.push(...((data ?? []) as ExistingProduct[]));
  }
  // SKU match is case-insensitive in the planner; also try exact-case misses.
  return out.map((p) => ({ ...p, price: p.price == null ? null : Number(p.price), images: p.images ?? [] }));
}

async function blockedFor(ctx: Ctx, rows: FullRow[]): Promise<string[]> {
  const texts = rows.map((r) => [r.nama, r.brand, r.kategori, r.deskripsi].map((c) => String(c ?? "")).join(" "));
  const skus = rows.map((r) => String(r.sku ?? "").trim());
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await db(ctx).rpc("staff_check_blocked", {
      _texts: texts.slice(i, i + 500),
      _skus: skus.slice(i, i + 500),
    });
    if (error) throw new Error(`Cek daftar blokir gagal: ${error.message}`);
    out.push(...((data ?? []) as string[]));
  }
  return out;
}

const cell = (v: unknown): RawCell => (typeof v === "number" || typeof v === "string" ? v : null);
type FullInput = { rows: FullRow[]; mode: ImportMode; fileName: string };
function validateFull(i: FullInput): FullInput {
  if (!i || !Array.isArray(i.rows)) throw new Error("File tidak valid.");
  if (i.rows.length > 5000) throw new Error("File terlalu besar (maks 5.000 baris).");
  return {
    mode: i.mode === "overwrite" ? "overwrite" : "fill",
    fileName: String(i.fileName ?? "").slice(0, 200),
    rows: i.rows.map((r) => ({
      row: Number(r.row) || 0,
      sku: cell(r.sku),
      nama: cell(r.nama),
      brand: cell(r.brand),
      kategori: cell(r.kategori),
      deskripsi: typeof r.deskripsi === "string" ? r.deskripsi.slice(0, 5000) : cell(r.deskripsi),
      harga: cell(r.harga),
      stok: cell(r.stok),
      berat: cell(r.berat),
      bpom: cell(r.bpom),
      fotos: (Array.isArray(r.fotos) ? r.fotos : []).slice(0, MAX_PHOTOS).map(cell),
      status: cell(r.status),
    })),
  };
}

async function planFor(ctx: Ctx, input: FullInput) {
  const products = await loadBySku(ctx, input.rows.map((r) => String(r.sku ?? "").trim()));
  const blocked = await blockedFor(ctx, input.rows);
  return planFullImport(input.rows, products, input.mode, blocked);
}

export const exportFullTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    const out: Array<ExistingProduct> = [];
    const cols = (await dimsSupported(ctx)) ? `${FULL_COLS},${DIM_COLS}` : FULL_COLS;
    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data, error } = await db(ctx).from("products").select(cols).order("sku").range(offset, offset + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as ExistingProduct[]));
      if (!data || data.length < 1000) break;
    }
    return {
      products: out.map((p) => ({
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        category: p.category,
        description: p.description,
        price: p.price == null ? null : Number(p.price),
        stock: p.stock,
        weight_grams: p.weight_grams,
        length_cm: p.length_cm == null ? null : Number(p.length_cm),
        width_cm: p.width_cm == null ? null : Number(p.width_cm),
        height_cm: p.height_cm == null ? null : Number(p.height_cm),
        bpom_number: p.bpom_number,
        // Our own signed links are long; re-uploading them is pointless, so leave photo cells empty.
        photoCount: (p.images ?? []).length,
        status: p.is_blocked ? "Diblokir" : p.is_active ? "Live" : "Draf",
      })),
    };
  });

export const previewFullImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateFull)
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requireRole(ctx, "admin");
    const plan = await planFor(ctx, data);
    return {
      totalRows: plan.totalRows,
      newCount: plan.rows.filter((r) => r.kind === "new").length,
      updateCount: plan.rows.filter((r) => r.kind === "update").length,
      unchanged: plan.unchanged,
      photoCount: plan.rows.reduce((n, r) => n + r.photos.length, 0),
      errors: plan.errors,
      drafts: plan.drafts,
    };
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Satu catatan `product_imports` per impor (semua batch). Ditulis dengan service role setelah izin diperiksa. */
async function ensureImportRecord(ctx: Ctx, input: FullInput, importId: string | null): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (importId) {
    const { data: row } = await supabaseAdmin
      .from("product_imports")
      .select("id,created_by,undone_at")
      .eq("id", importId)
      .maybeSingle();
    if (!row || row.created_by !== ctx.userId || row.undone_at) {
      throw new Error("Catatan impor tidak valid. Mulai ulang unggahan dari awal.");
    }
    return row.id;
  }
  const { data: created, error } = await supabaseAdmin
    .from("product_imports")
    .insert({ created_by: ctx.userId, file_name: input.fileName || null, mode: input.mode, summary: { created: 0, updated: 0 } })
    .select("id")
    .single();
  if (error || !created) throw new Error("Gagal menyiapkan cadangan impor. Tidak ada produk yang diubah.");
  return created.id;
}

async function writeImportSnapshot(importId: string, ctx: Ctx, planned: PlannedRow[]) {
  const ids = planned.filter((r) => r.kind === "update" && r.id).map((r) => r.id as string);
  const beforeById = new Map<string, Record<string, unknown>>();
  const snapCols = (await dimsSupported(ctx)) ? `${SNAPSHOT_SELECT},${DIM_COLS}` : SNAPSHOT_SELECT;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db(ctx).from("products").select(snapCols).in("id", ids.slice(i, i + 200));
    if (error) throw new Error("Gagal membuat cadangan sebelum impor. Tidak ada produk yang diubah.");
    for (const p of (data ?? []) as Array<Record<string, unknown>>) beforeById.set(String(p["id"]), p);
  }
  const rows = buildSnapshotRows(importId, planned, beforeById);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // ignoreDuplicates: bila batch diulang, cadangan pertama (sebelum diubah) tidak ditimpa.
  const { error } = await supabaseAdmin
    .from("product_import_rows")
    .upsert(rows as never, { onConflict: "import_id,sku", ignoreDuplicates: true });
  if (error) throw new Error("Gagal menyimpan cadangan sebelum impor. Tidak ada produk yang diubah.");
}

/** Baris yang gagal tidak mengubah apa pun; buang dari cadangan agar pembatalan tidak menyentuh produk lain dengan SKU sama. */
async function dropFailedSnapshots(importId: string, planned: PlannedRow[], failed: Array<{ sku: string }>) {
  const failedSkus = new Set(failed.map((f) => f.sku));
  const skus = planned.filter((r) => failedSkus.has(r.sku)).map((r) => r.sku);
  if (!skus.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("product_import_rows").delete().eq("import_id", importId).in("sku", skus).eq("existed", false);
}

async function addImportSummary(importId: string, add: { created: number; updated: number }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("product_imports").select("summary").eq("id", importId).maybeSingle();
    const prev = (row?.summary ?? {}) as { created?: number; updated?: number };
    await supabaseAdmin
      .from("product_imports")
      .update({ summary: { created: (prev.created ?? 0) + add.created, updated: (prev.updated ?? 0) + add.updated } })
      .eq("id", importId);
  } catch (e) {
    console.warn("import summary not updated", e instanceof Error ? e.message : e);
  }
}

export interface LastImport {
  id: string;
  createdAt: string;
  fileName: string | null;
  created: number;
  updated: number;
}

/** Impor terakhir yang belum dibatalkan (untuk tombol "Batalkan impor terakhir"). */
export const getLastImport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ last: LastImport | null }> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "uploads_use");
    const { data, error } = await db(ctx)
      .from("product_imports")
      .select("id,created_at,file_name,summary,undone_at")
      .is("undone_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Riwayat impor tidak bisa dibaca.");
    if (!data) return { last: null };
    const s = (data.summary ?? {}) as { created?: number; updated?: number };
    return {
      last: { id: data.id, createdAt: data.created_at, fileName: data.file_name, created: s.created ?? 0, updated: s.updated ?? 0 },
    };
  });

/** Memulihkan impor terakhir lewat RPC undo_product_import (cek izin, urutan, dan audit ada di database). */
export const undoLastImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { importId: string }) => {
    if (!i || typeof i.importId !== "string" || !UUID_RE.test(i.importId)) throw new Error("Impor tidak valid.");
    return { importId: i.importId };
  })
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "uploads_use");
    const { data: res, error } = await db(ctx).rpc("undo_product_import", { _import_id: data.importId });
    if (error) {
      if (/forbidden/i.test(error.message)) throw new Error("403 — akses ditolak.");
      throw new Error(error.message || "Impor tidak bisa dibatalkan.");
    }
    const r = (res ?? {}) as { restored?: number; archived?: number };
    return { restored: r.restored ?? 0, archived: r.archived ?? 0 };
  });

/** Applies one chunk (≤100 rows). The browser sends chunks in order and can resume. */
export const applyFullImportChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: FullInput & { chunk: number; last: boolean; importId?: string | null }) => {
    const v = validateFull(i);
    if (v.rows.length > 100) throw new Error("Maks 100 baris per batch.");
    const importId = typeof i.importId === "string" && UUID_RE.test(i.importId) ? i.importId : null;
    return { ...v, chunk: Number(i.chunk) || 0, last: !!i.last, importId };
  })
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "uploads_use");
    const plan = await planFor(ctx, data);
    // Cadangan (snapshot) ditulis SEBELUM produk diubah. Bila gagal, tidak ada yang diubah.
    let importId = data.importId;
    if (plan.rows.length) {
      importId = await ensureImportRecord(ctx, data, importId);
      await writeImportSnapshot(importId, ctx, plan.rows);
    }
    const failed: Array<{ row: number; sku: string; reason: string }> = [...plan.errors];
    const photoJobs: Array<{ id: string; sku: string; row: number; urls: string[]; replace: boolean; publish: boolean }> = [];
    let created = 0;
    let updated = 0;
    for (const r of plan.rows) {
      try {
        let id = r.id;
        const wantsLiveNow = r.publish === true && r.photos.length === 0;
        if (r.kind === "new") {
          id = await insertProduct(
            ctx,
            {
              name: r.patch.name ?? r.sku,
              brand: r.patch.brand ?? "",
              category: r.patch.category ?? "",
              description: r.patch.description,
              bpom_number: r.patch.bpom_number,
              sku: r.sku,
              price: r.patch.price === undefined ? undefined : String(r.patch.price),
              stock: r.patch.stock === undefined ? undefined : String(r.patch.stock),
              weight_grams: r.patch.weight_grams === undefined ? undefined : String(r.patch.weight_grams),
            },
            wantsLiveNow ? { is_active: true } : {},
          );
          if (r.patch.length_cm !== undefined) {
            if (!(await dimsSupported(ctx))) throw new Error(MSG_DIMS_NOT_READY);
            const { error: dErr } = await db(ctx).from("products").update({ length_cm: r.patch.length_cm, width_cm: r.patch.width_cm, height_cm: r.patch.height_cm }).eq("id", id!);
            if (dErr) throw new Error(`Ukuran gagal disimpan: ${dErr.message}`);
          }
          created++;
        } else {
          const patch: Record<string, unknown> = { ...r.patch };
          if (patch["length_cm"] !== undefined && !(await dimsSupported(ctx))) throw new Error(MSG_DIMS_NOT_READY);
          if (r.publish === false) patch["is_active"] = false;
          if (wantsLiveNow) patch["is_active"] = true;
          if (Object.keys(patch).length) {
            const { data: row, error } = await db(ctx).from("products").update(patch).eq("id", id).select("id").maybeSingle();
            if (error || !row) throw new Error(error?.message ?? "akses ditolak");
          }
          updated++;
        }
        if (r.photos.length) {
          photoJobs.push({ id: id!, sku: r.sku, row: r.row, urls: r.photos, replace: r.kind === "update", publish: r.publish === true });
        }
      } catch (e) {
        failed.push({ row: r.row, sku: r.sku, reason: e instanceof Error ? e.message : "gagal" });
      }
    }
    // Rows asked to go Live without new photos: report the trigger's verdict.
    const liveSkus = plan.rows.filter((r) => r.publish === true && r.photos.length === 0).map((r) => r.sku);
    const stayedDraft: Array<{ row: number; sku: string; reason: string }> = [];
    if (liveSkus.length) {
      const { data: rows } = await db(ctx).from("products").select("sku,is_active,publish_issue").in("sku", liveSkus);
      for (const p of rows ?? []) {
        if (!p.is_active) {
          const r = plan.rows.find((x) => x.sku === p.sku)!;
          stayedDraft.push({ row: r.row, sku: p.sku, reason: p.publish_issue ?? "Tetap Draf" });
        }
      }
    }
    if (importId) {
      await dropFailedSnapshots(importId, plan.rows, failed);
      await addImportSummary(importId, { created, updated });
    }
    if (data.last || data.chunk === 0) {
      await audit(ctx, "seller_bulk_upload", null, { fileName: data.fileName, chunk: data.chunk, mode: data.mode, importId });
    }
    return { created, updated, unchanged: plan.unchanged, failed, stayedDraft, photoJobs, importId };
  });

// ---------- blocklist & activity ----------

export const listBlocklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = asCtx(context);
    const role = await requireRole(ctx, "admin");
    const [k, s, b] = await Promise.all([
      db(ctx).from("product_blocklist").select("pattern,reason").order("reason"),
      db(ctx).from("product_blocked_skus").select("sku,reason").order("sku"),
      db(ctx).from("products").select("id", { count: "exact", head: true }).eq("is_blocked", true),
    ]);
    if (k.error) throw new Error(k.error.message);
    if (s.error) throw new Error(s.error.message);
    return {
      role,
      keywords: (k.data ?? []) as Array<{ pattern: string; reason: string }>,
      skus: (s.data ?? []) as Array<{ sku: string; reason: string }>,
      blockedProducts: (b.count as number) ?? 0,
    };
  });

export const addBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { kind: "keyword" | "sku"; value: string; reason: string }) => ({
    kind: i?.kind === "sku" ? "sku" : "keyword",
    value: String(i?.value ?? "").slice(0, 80),
    reason: String(i?.reason ?? "").slice(0, 120),
  }))
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "blocklist_edit");
    const { data: n, error } = await db(ctx).rpc("owner_add_block", { _kind: data.kind, _value: data.value, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { productsBlocked: Number(n) || 0 };
  });

export const removeBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { kind: "keyword" | "sku"; value: string }) => ({
    kind: i?.kind === "sku" ? "sku" : "keyword",
    value: String(i?.value ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "blocklist_edit");
    const { error } = await db(ctx).rpc("owner_remove_block", { _kind: data.kind, _value: data.value });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { offset?: number; onlyProducts?: boolean }) => ({
    offset: Math.max(0, Number(i?.offset) || 0),
    onlyProducts: i?.onlyProducts !== false,
  }))
  .handler(async ({ data, context }) => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "audit_view");
    let q = db(ctx).from("admin_audit_log").select("id,user_id,action,product_id,payload,created_at");
    if (data.onlyProducts) q = q.eq("action", "product_change");
    const { data: rows, error } = await q.order("created_at", { ascending: false }).range(data.offset, data.offset + 49);
    if (error) throw new Error(error.message);
    const ids = [...new Set((rows ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean))] as string[];
    const emails: Record<string, string> = {};
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const id of ids) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u?.user?.email) emails[id] = u.user.email;
      }
    }
    return {
      entries: ((rows ?? []) as Array<{ id: string; user_id: string | null; action: string; product_id: string | null; payload: Record<string, unknown> | null; created_at: string }>).map(
        ({ payload, ...r }) => ({ ...r, payloadJson: JSON.stringify(payload ?? {}), who: r.user_id ? (emails[r.user_id] ?? "staf") : "sistem (pesanan)" }),
      ),
      nextOffset: (rows ?? []).length === 50 ? data.offset + 50 : null,
    };
  });
