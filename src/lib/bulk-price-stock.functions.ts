// Bulk price & stock export/import (admin/owner). Writes run as the signed-in user
// (RLS + products_guard trigger). hpp is never read or written here.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requireRole, type Ctx } from "./admin.functions";
import { planImport, type CurrentProduct, type RawRow } from "./bulk-price-stock";

export interface ExportRow extends CurrentProduct {
  brand: string;
  category: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadAll(ctx: Ctx): Promise<ExportRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = ctx.supabase as any;
  const out: ExportRow[] = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const { data, error } = await db
      .from("products")
      .select("id,sku,name,brand,category,price,compare_at_price,stock")
      .order("sku")
      .range(offset, offset + 999);
    if (error) throw new Error(`Gagal membaca produk: ${error.message}`);
    out.push(...((data ?? []) as ExportRow[]));
    if (!data || data.length < 1000) break;
  }
  return out.map((p) => ({
    ...p,
    price: p.price === null ? null : Number(p.price),
    compare_at_price: p.compare_at_price === null ? null : Number(p.compare_at_price),
  }));
}

type RowsInput = { rows: RawRow[]; fileName: string };
function validateRows(input: RowsInput): RowsInput {
  if (!input || !Array.isArray(input.rows)) throw new Error("File tidak valid.");
  if (input.rows.length > 20000) throw new Error("File terlalu besar (maks 20.000 baris).");
  const cell = (v: unknown) => (typeof v === "number" || typeof v === "string" ? v : null);
  return {
    fileName: String(input.fileName ?? "").slice(0, 200),
    rows: input.rows.map((r) => ({
      row: Number(r.row) || 0,
      sku: cell(r.sku),
      harga_jual: cell(r.harga_jual),
      harga_coret: cell(r.harga_coret),
      stok: cell(r.stok),
    })),
  };
}

export const exportPriceStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    return { products: await loadAll(ctx) };
  });

export const previewPriceStockImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRows)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const plan = planImport(data.rows, await loadAll(ctx));
    return {
      totalRows: plan.totalRows,
      willUpdate: plan.updates.length,
      unchanged: plan.unchanged,
      unknownSku: plan.unknownSku,
      invalid: plan.invalid,
    };
  });

export const applyPriceStockImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRows)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    // Re-plan against fresh data; never trust a client-side preview.
    const plan = planImport(data.rows, await loadAll(ctx));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;
    let updated = 0;
    const failed: Array<{ sku: string; reason: string }> = [];
    const BATCH = 25;
    for (let i = 0; i < plan.updates.length; i += BATCH) {
      const chunk = plan.updates.slice(i, i + BATCH);
      const results = await Promise.all(
        chunk.map(async (u) => {
          const { data: row, error } = await db
            .from("products")
            .update(u.patch)
            .eq("id", u.id)
            .select("id")
            .maybeSingle();
          return { u, ok: !error && !!row, reason: error?.message ?? "akses ditolak" };
        }),
      );
      for (const r of results) {
        if (r.ok) updated++;
        else failed.push({ sku: r.u.sku, reason: r.reason });
      }
    }
    const counts = {
      totalRows: plan.totalRows,
      updated,
      failed: failed.length,
      unchanged: plan.unchanged,
      unknownSku: plan.unknownSku.length,
      invalid: plan.invalid.length,
    };
    await audit(ctx, "bulk_price_stock_import", null, { fileName: data.fileName, ...counts });
    return { ...counts, failedRows: failed, unknownSkuRows: plan.unknownSku, invalidRows: plan.invalid };
  });
