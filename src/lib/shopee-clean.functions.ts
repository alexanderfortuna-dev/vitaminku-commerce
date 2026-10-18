// Foto Shopee dari CSV "bersih": dry-run, terapkan yang yakin (auto), simpan antrean "perlu ditinjau" di Seller Center.
// Nama/deskripsi/kategori Shopee tidak pernah ditulis ke products; foto diunduh ke bucket privat (WebP 800 + 400 px).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requirePermission, type Ctx } from "./admin.functions";
import { applyOne, mapPool } from "./shopee-photos.functions";
import {
  parseShopeeCleanCsv,
  planShopeeClean,
  type AutoPair,
  type CleanPlan,
  type VkProduct,
} from "./shopee-clean-match";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (ctx: Ctx): any => ctx.supabase;
const asCtx = (c: unknown) => c as Ctx;

export const CLEAN_MAX_CSV_CHARS = 3_000_000;
export const CLEAN_APPLY_BATCH = 10;
export const CONFIRM_WORD = "TERAPKAN";
const PARALLEL = 3;

function validateCsv(i: { csvText?: unknown }): { csvText: string } {
  const t = typeof i?.csvText === "string" ? i.csvText : "";
  if (!t.trim()) throw new Error("File kosong.");
  if (t.length > CLEAN_MAX_CSV_CHARS) throw new Error("File terlalu besar.");
  return { csvText: t };
}

async function loadActiveProducts(ctx: Ctx): Promise<VkProduct[]> {
  const out: VkProduct[] = [];
  for (let offset = 0; offset < 30000; offset += 1000) {
    const { data, error } = await db(ctx)
      .from("products")
      .select("id,sku,name,dose,pack_count,size,flavor,images,image_url")
      .eq("is_active", true)
      .eq("is_blocked", false)
      .order("sku")
      .range(offset, offset + 999);
    if (error) throw new Error(`Gagal membaca produk: ${error.message}`);
    out.push(...((data ?? []) as VkProduct[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function buildPlan(ctx: Ctx, csvText: string): Promise<{ plan: CleanPlan; problems: string[] }> {
  const { items, problems } = parseShopeeCleanCsv(csvText);
  if (items.length === 0) throw new Error(problems[0] ?? "Tidak ada baris Shopee yang bisa dibaca.");
  const products = await loadActiveProducts(ctx);
  return { plan: planShopeeClean(items, products), problems };
}

// ---------- dry-run (tidak menulis apa pun) ----------

export interface CleanPreview {
  stats: CleanPlan["stats"];
  problems: string[];
  samples: Array<{ sku: string; vitaminku: string; shopee: string; confidence: number; photos: number }>;
  /** Produk yang yakin cocok pada saat dry-run; "Terapkan" hanya boleh memasang produk di daftar ini. */
  autoProductIds: string[];
  review: Array<{ sku: string; vitaminku: string; reason: string; best: string; bestScore: number }>;
  unmatched: Array<{ sku: string; vitaminku: string }>;
}

export const previewShopeeClean = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateCsv)
  .handler(async ({ data, context }): Promise<CleanPreview> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "products_photos");
    const { plan, problems } = await buildPlan(ctx, data.csvText);
    const step = Math.max(1, Math.floor(plan.auto.length / 10));
    const samples = plan.auto
      .filter((_, i) => i % step === 0)
      .slice(0, 10)
      .map((a) => ({ sku: a.sku, vitaminku: a.productName, shopee: a.item.name, confidence: a.confidence, photos: a.item.images.length }));
    return {
      stats: plan.stats,
      problems,
      autoProductIds: plan.auto.map((a) => a.productId),
      samples,
      review: plan.review.map((r) => ({ sku: r.sku, vitaminku: r.productName, reason: r.reason, best: r.candidates[0]?.shopeeName ?? "", bestScore: r.candidates[0]?.confidence ?? 0 })),
      unmatched: plan.unmatched.map((u) => ({ sku: u.sku, vitaminku: u.productName })),
    };
  });

// ---------- simpan antrean tinjau (menulis HANYA ke shopee_photo_candidates) ----------

function validateConfirm(i: { csvText?: unknown; confirm?: unknown }): { csvText: string } {
  if (i?.confirm !== CONFIRM_WORD) throw new Error(`Ketik ${CONFIRM_WORD} untuk melanjutkan.`);
  return validateCsv(i);
}

export const saveShopeeReviewQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateConfirm)
  .handler(async ({ data, context }): Promise<{ saved: number; products: number }> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "products_photos");
    const { plan } = await buildPlan(ctx, data.csvText);
    const rows = plan.review.flatMap((r) =>
      r.candidates
        .filter((c) => c.images.length > 0)
        .map((c) => ({
          product_id: r.productId,
          shopee_item_id: c.itemId,
          shopee_name: c.shopeeName.slice(0, 300),
          score: c.confidence,
          reason: r.reason.slice(0, 300),
          shared_with_others: c.shared,
          image_urls: c.images.slice(0, 9),
        })),
    );
    let saved = 0;
    for (let i = 0; i < rows.length; i += 200) {
      // ignoreDuplicates: keputusan yang sudah diambil (applied/skipped) tidak ditimpa.
      const { error } = await db(ctx).from("shopee_photo_candidates").upsert(rows.slice(i, i + 200), { onConflict: "product_id,shopee_item_id", ignoreDuplicates: true });
      if (error) throw new Error(`Gagal menyimpan antrean: ${error.message}`);
      saved += Math.min(200, rows.length - i);
    }
    await audit(ctx, "shopee_review_queue_saved", null, { candidates: saved, products: plan.review.length });
    return { saved, products: plan.review.length };
  });

// ---------- terapkan yang yakin (auto), bertahap ----------

export interface CleanApplyResult {
  results: Array<{ sku: string; status: "ok" | "gagal" | "dilewati"; stored: number; alasan?: string }>;
}

function validateApplyBatch(i: { csvText?: unknown; confirm?: unknown; productIds?: unknown }): { csvText: string; productIds: string[] } {
  const base = validateConfirm(i);
  if (!Array.isArray(i?.productIds) || i.productIds.length === 0 || i.productIds.length > CLEAN_APPLY_BATCH) throw new Error(`Kirim 1-${CLEAN_APPLY_BATCH} produk per panggilan.`);
  return { ...base, productIds: (i.productIds as unknown[]).map((x) => String(x).slice(0, 64)) };
}

export const applyShopeeClean = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateApplyBatch)
  .handler(async ({ data, context }): Promise<CleanApplyResult> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "products_photos");
    // Rencana dihitung ulang di server dari CSV + produk di database (urutan deterministik per SKU).
    const { plan } = await buildPlan(ctx, data.csvText);
    // Hanya produk yang diminta DAN masih "auto" menurut perhitungan server sekarang; sisanya dilewati (tidak ditebak).
    const byProduct = new Map(plan.auto.map((a) => [a.productId, a]));
    const results = await mapPool(data.productIds, PARALLEL, async (pid) => {
      const a: AutoPair | undefined = byProduct.get(pid);
      if (!a) return { sku: pid.slice(0, 8), status: "dilewati" as const, stored: 0, alasan: "Tidak lagi cocok pasti (sudah berfoto atau data berubah)." };
      try {
        const r = await applyOne(ctx, { key: a.item.itemId, row: 0, productId: a.productId, sku: a.sku, urls: a.item.images, dasar: "nama" }, "lewati");
        return { sku: a.sku, status: r.status, stored: r.stored, ...(r.alasan ? { alasan: r.alasan } : {}) };
      } catch (e) {
        return { sku: a.sku, status: "gagal" as const, stored: 0, alasan: e instanceof Error ? e.message : "gagal" };
      }
    });
    return { results };
  });

// ---------- antrean tinjau: daftar & keputusan satu klik ----------

export interface ReviewCard {
  productId: string;
  sku: string;
  name: string;
  candidates: Array<{ id: string; shopeeName: string; score: number; reason: string; shared: number; images: string[] }>;
}

export const listShopeeReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { offset?: unknown }) => ({ offset: Math.max(0, Math.floor(Number(i?.offset) || 0)) }))
  .handler(async ({ data, context }): Promise<{ cards: ReviewCard[]; pendingProducts: number }> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "products_photos");
    const { data: rows, error } = await db(ctx)
      .from("shopee_photo_candidates")
      .select("id,product_id,shopee_name,score,reason,shared_with_others,image_urls,products(sku,name,images)")
      .eq("status", "pending")
      .order("product_id")
      .order("score", { ascending: false })
      .limit(3000);
    if (error) throw new Error(`Gagal membaca antrean: ${error.message}`);
    const by = new Map<string, ReviewCard>();
    for (const r of (rows ?? []) as Array<{ id: string; product_id: string; shopee_name: string; score: number; reason: string; shared_with_others: number; image_urls: string[]; products: { sku: string; name: string; images: string[] } | null }>) {
      if (!r.products || (r.products.images?.length ?? 0) > 0) continue; // produk yang sudah berfoto tidak perlu ditinjau
      let card = by.get(r.product_id);
      if (!card) by.set(r.product_id, (card = { productId: r.product_id, sku: r.products.sku, name: r.products.name, candidates: [] }));
      card.candidates.push({ id: r.id, shopeeName: r.shopee_name, score: Number(r.score), reason: r.reason, shared: r.shared_with_others, images: r.image_urls });
    }
    const all = [...by.values()].sort((a, b) => a.sku.localeCompare(b.sku));
    return { cards: all.slice(data.offset, data.offset + 20), pendingProducts: all.length };
  });

export const decideShopeeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { productId?: unknown; candidateId?: unknown }) => ({
    productId: String(i?.productId ?? "").slice(0, 64),
    candidateId: i?.candidateId ? String(i.candidateId).slice(0, 64) : null,
  }))
  .handler(async ({ data, context }): Promise<{ status: "applied" | "skipped" | "gagal"; alasan?: string }> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "products_photos");
    const now = new Date().toISOString();
    const userId = (ctx as unknown as { userId?: string }).userId ?? null;
    if (!data.candidateId) {
      const { error } = await db(ctx).from("shopee_photo_candidates").update({ status: "skipped", decided_by: userId, decided_at: now }).eq("product_id", data.productId).eq("status", "pending");
      if (error) throw new Error(error.message);
      await audit(ctx, "shopee_review_skip", data.productId, {});
      return { status: "skipped" };
    }
    // Foto diambil dari database (bukan dari browser) dan kandidat harus milik produk ini.
    const { data: cand, error } = await db(ctx).from("shopee_photo_candidates").select("id,product_id,image_urls,status,products(sku)").eq("id", data.candidateId).eq("product_id", data.productId).maybeSingle();
    if (error || !cand) return { status: "gagal", alasan: "Kandidat tidak ditemukan." };
    if (cand.status !== "pending") return { status: "gagal", alasan: "Kandidat ini sudah diputuskan." };
    const sku = (cand.products as { sku: string } | null)?.sku ?? "";
    const r = await applyOne(ctx, { key: cand.id, row: 0, productId: cand.product_id, sku, urls: cand.image_urls as string[], dasar: "pilihan" }, "lewati");
    if (r.status === "gagal") return { status: "gagal", alasan: r.alasan ?? "Gagal memasang foto." };
    if (r.status === "dilewati") {
      // Produk sudah berfoto / diblokir sejak antrean dibuat: tidak ada yang dipasang, antrean produk ditutup.
      await db(ctx).from("shopee_photo_candidates").update({ status: "skipped", decided_by: userId, decided_at: now }).eq("product_id", cand.product_id).eq("status", "pending");
      return { status: "skipped", ...(r.alasan ? { alasan: r.alasan } : {}) };
    }
    await db(ctx).from("shopee_photo_candidates").update({ status: "applied", decided_by: userId, decided_at: now }).eq("id", cand.id);
    await db(ctx).from("shopee_photo_candidates").update({ status: "skipped", decided_by: userId, decided_at: now }).eq("product_id", cand.product_id).eq("status", "pending");
    await audit(ctx, "shopee_review_apply", cand.product_id, { sku, candidate: cand.id, stored: r.stored });
    return { status: "applied" };
  });
