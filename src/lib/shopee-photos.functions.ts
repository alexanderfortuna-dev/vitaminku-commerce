// Impor Foto dari ekspor Shopee (Seller Center). Semua pencocokan dihitung ULANG di server dari data database;
// hasil pratinjau browser tidak dipercaya. Foto diunduh lalu disimpan ulang di bucket privat `product-images`
// (dua WebP: 800 px dan thumbnail 400 px) — tidak pernah hotlink ke Shopee.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requirePermission, type Ctx } from "./admin.functions";
import {
  planShopeePhotos,
  selectApplicable,
  type ApplyJob,
  type ApplyRequestItem,
  type Candidate,
  type GalatJenis,
  type PlanMode,
  type ProductLite,
  type ShopeePlan,
  type ShopeeRow,
  type TinjauKode,
} from "./shopee-photo-match";
import { MAX_PHOTOS } from "./seller-import";
import { nextPhotoIndex, photoPaths, safeSkuSegment } from "./photo-naming";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (ctx: Ctx): any => ctx.supabase;
const asCtx = (c: unknown) => c as Ctx;

const BUCKET = "product-images";
const SIGNED_URL_SECONDS = 60 * 60 * 24 * 365 * 10; // sama dengan storeProductImage di seller.functions.ts
export const SHOPEE_MAX_ROWS = 3000;
export const SHOPEE_APPLY_BATCH_MAX = 25;
const PARALLEL_PRODUCTS = 3;

// ---------- validasi masukan ----------

interface RowsInput {
  rows: ShopeeRow[];
  mode: PlanMode;
}

function validateRows(i: { rows?: unknown; mode?: unknown }): RowsInput {
  if (!i || !Array.isArray(i.rows)) throw new Error("File tidak valid.");
  if (i.rows.length > SHOPEE_MAX_ROWS) throw new Error(`File terlalu besar (maks ${SHOPEE_MAX_ROWS.toLocaleString("id-ID")} baris).`);
  const rows = (i.rows as Array<Partial<ShopeeRow>>).map((r) => ({
    row: Math.max(0, Math.floor(Number(r?.row) || 0)),
    sku: String(r?.sku ?? "").slice(0, 120),
    name: String(r?.name ?? "").slice(0, 300),
    urls: (Array.isArray(r?.urls) ? r.urls : []).slice(0, 30).map((u) => String(u ?? "").slice(0, 1100)),
  }));
  return { rows, mode: i.mode === "timpa" ? "timpa" : "lewati" };
}

// ---------- baca produk ----------

async function loadProducts(ctx: Ctx): Promise<ProductLite[]> {
  const out: ProductLite[] = [];
  for (let offset = 0; offset < 30000; offset += 1000) {
    const { data, error } = await db(ctx)
      .from("products")
      .select("id,sku,name,images,is_blocked")
      .order("sku")
      .range(offset, offset + 999);
    if (error) throw new Error(`Gagal membaca produk: ${error.message}`);
    for (const p of (data ?? []) as Array<{ id: string; sku: string; name: string; images: string[] | null; is_blocked: boolean }>) {
      out.push({ id: p.id, sku: p.sku ?? "", name: p.name ?? "", images: p.images ?? [], blocked: !!p.is_blocked });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ---------- pratinjau (dry-run, tidak menulis apa pun) ----------

export interface PreviewPasti {
  key: string;
  row: number;
  sku: string;
  name: string;
  produk: { id: string; sku: string; name: string };
  jumlahFoto: number;
  dasar: "sku" | "nama";
  catatan: string[];
}
export interface PreviewTinjau {
  key: string;
  row: number;
  sku: string;
  name: string;
  jumlahFoto: number;
  alasan: string;
  kode: TinjauKode;
  kandidat: Candidate[];
}
export interface PreviewDilewati {
  key: string;
  row: number;
  sku: string;
  name: string;
  alasan: string;
  produkSku: string | null;
}
export interface PreviewGalat {
  key: string;
  row: number;
  sku: string;
  name: string;
  jenis: GalatJenis;
  alasan: string;
}
export interface ShopeePreview {
  totalBaris: number;
  pasti: PreviewPasti[];
  tinjau: PreviewTinjau[];
  dilewati: PreviewDilewati[];
  galat: PreviewGalat[];
  produkTanpaFoto: number;
  produkTanpaFotoTertutup: number;
}

function slim(plan: ShopeePlan, products: ProductLite[]): ShopeePreview {
  const noPhoto = products.filter((p) => p.images.length === 0 && !p.blocked);
  const covered = new Set<string>(plan.pasti.map((p) => p.produk.id));
  return {
    totalBaris: plan.totalBaris,
    pasti: plan.pasti.map((p) => ({
      key: p.key, row: p.row.row, sku: p.row.sku, name: p.row.name, produk: p.produk,
      jumlahFoto: p.urls.length, dasar: p.dasar, catatan: p.catatan,
    })),
    tinjau: plan.tinjau.map((t) => ({
      key: t.key, row: t.row.row, sku: t.row.sku, name: t.row.name, jumlahFoto: t.urls.length,
      alasan: t.alasan, kode: t.kode, kandidat: t.kandidat,
    })),
    dilewati: plan.dilewati.map((d) => ({
      key: d.key, row: d.row.row, sku: d.row.sku, name: d.row.name, alasan: d.alasan, produkSku: d.produk?.sku ?? null,
    })),
    galat: plan.galat.map((g) => ({ key: g.key, row: g.row.row, sku: g.row.sku, name: g.row.name, jenis: g.jenis, alasan: g.alasan })),
    produkTanpaFoto: noPhoto.length,
    produkTanpaFotoTertutup: noPhoto.filter((p) => covered.has(p.id)).length,
  };
}

export const previewShopeePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRows)
  .handler(async ({ data, context }): Promise<ShopeePreview> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "products_photos");
    const products = await loadProducts(ctx);
    return slim(planShopeePhotos(data.rows, products, { mode: data.mode }), products);
  });

// ---------- terapkan (bertahap) ----------

export interface ApplyItemResult {
  key: string;
  sku: string;
  status: "ok" | "gagal" | "dilewati";
  stored: number;
  alasan?: string;
  gagalFoto: Array<{ url: string; alasan: string }>;
}

export interface ApplyResult {
  results: ApplyItemResult[];
  ditolak: Array<{ key: string; alasan: string }>;
}

type ApplyInput = RowsInput & { items: ApplyRequestItem[] };

function validateApply(i: { rows?: unknown; mode?: unknown; items?: unknown }): ApplyInput {
  const base = validateRows(i);
  if (!Array.isArray(i.items) || i.items.length === 0) throw new Error("Tidak ada produk dipilih.");
  if (i.items.length > SHOPEE_APPLY_BATCH_MAX) throw new Error(`Maks ${SHOPEE_APPLY_BATCH_MAX} produk per panggilan.`);
  const items = (i.items as Array<Partial<ApplyRequestItem>>).map((it) => ({
    key: String(it?.key ?? "").slice(0, 12),
    productId: String(it?.productId ?? "").slice(0, 64),
    pilihan: it?.pilihan === true,
    ...(Array.isArray(it?.urls) ? { urls: it.urls.slice(0, 30).map((u) => String(u ?? "").slice(0, 1100)) } : {}),
  }));
  return { ...base, items };
}

export async function mapPool<T, R>(list: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, list.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= list.length) return;
        out[i] = await fn(list[i]!);
      }
    }),
  );
  return out;
}

export async function applyOne(ctx: Ctx, job: ApplyJob, mode: PlanMode): Promise<ApplyItemResult> {
  const base = { key: job.key, sku: job.sku, stored: 0, gagalFoto: [] as ApplyItemResult["gagalFoto"] };
  // Baca ulang produk sekarang (bisa berubah sejak pratinjau / panggilan sebelumnya).
  const { data: cur, error } = await db(ctx).from("products").select("id,sku,images,is_blocked").eq("id", job.productId).maybeSingle();
  if (error || !cur) return { ...base, status: "gagal", alasan: "Produk tidak ditemukan atau akses ditolak." };
  if (cur.is_blocked) return { ...base, status: "dilewati", alasan: "Produk diblokir." };
  const existing = (cur.images ?? []) as string[];
  if (existing.length > 0 && mode === "lewati") {
    return { ...base, status: "dilewati", alasan: `Sudah punya ${existing.length} foto.` };
  }

  const { downloadPublicImage } = await import("./image-download.server");
  const { processToWebp } = await import("./photo-process.server");

  // Tahap 1: unduh + proses SEMUA foto di memori. Foto sampul (pertama) wajib berhasil.
  const processed: Array<{ main: Uint8Array; thumb: Uint8Array } | null> = [];
  const gagalFoto: ApplyItemResult["gagalFoto"] = [];
  for (const url of job.urls.slice(0, MAX_PHOTOS)) {
    try {
      const img = await downloadPublicImage(url);
      processed.push(await processToWebp(img.bytes));
    } catch (e) {
      processed.push(null);
      gagalFoto.push({ url, alasan: e instanceof Error ? e.message : "gagal" });
    }
  }
  if (!processed[0]) {
    return { ...base, status: "gagal", alasan: "Foto sampul gagal diunduh. Produk tidak diubah.", gagalFoto };
  }

  // Tahap 2: simpan ke bucket privat. Nomor berkas berlanjut dari yang sudah ada (tidak menimpa).
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const folder = safeSkuSegment(job.sku);
  const { data: listing } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit: 500 });
  let n = nextPhotoIndex((listing ?? []).map((f: { name: string }) => f.name));
  const signed: string[] = [];
  for (let i = 0; i < processed.length; i++) {
    const p = processed[i];
    if (!p) continue;
    try {
      const paths = photoPaths(job.sku, n);
      // Thumbnail dulu: bila foto utama gagal, yang tersisa hanya thumbnail yatim (tidak dipakai).
      const up1 = await supabaseAdmin.storage.from(BUCKET).upload(paths.thumb, p.thumb, { contentType: "image/webp", upsert: false });
      if (up1.error) throw new Error(`Upload gagal: ${up1.error.message}`);
      const up2 = await supabaseAdmin.storage.from(BUCKET).upload(paths.main, p.main, { contentType: "image/webp", upsert: false });
      if (up2.error) throw new Error(`Upload gagal: ${up2.error.message}`);
      const link = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(paths.main, SIGNED_URL_SECONDS);
      if (link.error || !link.data) throw new Error("Link gambar gagal dibuat.");
      signed.push(link.data.signedUrl);
      n++;
    } catch (e) {
      gagalFoto.push({ url: job.urls[i] ?? "", alasan: e instanceof Error ? e.message : "gagal" });
      if (i === 0) return { ...base, status: "gagal", alasan: "Foto sampul gagal disimpan. Produk tidak diubah.", gagalFoto };
    }
  }
  if (signed.length === 0) return { ...base, status: "gagal", alasan: "Tidak ada foto yang tersimpan.", gagalFoto };

  // Tahap 3: perbarui galeri sebagai user (RLS + products_guard tetap berlaku); trigger mengisi image_url.
  const images = (mode === "timpa" ? signed : [...existing, ...signed]).slice(0, MAX_PHOTOS);
  const { data: row, error: upErr } = await db(ctx).from("products").update({ images }).eq("id", job.productId).select("id").maybeSingle();
  if (upErr || !row) {
    return { ...base, status: "gagal", alasan: `Database menolak perubahan${upErr ? `: ${upErr.message}` : " (akses ditolak)"}.`, gagalFoto };
  }
  await audit(ctx, "shopee_photos_apply", job.productId, {
    sku: job.sku,
    row: job.row,
    dasar: job.dasar,
    mode,
    stored: signed.length,
    failed: gagalFoto.length,
    replaced: mode === "timpa" && existing.length > 0,
  });
  return { ...base, status: "ok", stored: signed.length, gagalFoto };
}

export const applyShopeePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateApply)
  .handler(async ({ data, context }): Promise<ApplyResult> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "products_photos");
    // Pencocokan dihitung ulang dari baris + produk di database. Browser hanya menyebut baris & produk yang diinginkan.
    const products = await loadProducts(ctx);
    const plan = planShopeePhotos(data.rows, products, { mode: data.mode });
    const { jobs, ditolak } = selectApplicable(plan, data.items, data.mode);
    const results = await mapPool(jobs, PARALLEL_PRODUCTS, async (job) => {
      try {
        return await applyOne(ctx, job, data.mode);
      } catch (e) {
        return {
          key: job.key, sku: job.sku, status: "gagal" as const, stored: 0, gagalFoto: [],
          alasan: e instanceof Error ? e.message : "gagal",
        };
      }
    });
    return { results, ditolak };
  });
