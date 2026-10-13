// Server untuk "Tambah Produk Cepat". Semua tulis berjalan sebagai pengguna yang login (RLS + products_guard).
// Produk SELALU dibuat sebagai Draf (is_active = false): aman, tidak tayang sebelum lolos "Siap Tayang".
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requirePermission, type Ctx } from "./admin.functions";
import {
  classifyInsertError,
  cleanQuickProduct,
  insertErrorMessage,
  temporarySku,
  type QuickProductInput,
} from "./quick-product";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (ctx: Ctx): any => ctx.supabase;

export const getQuickProductOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "products_edit");
    const brands = new Set<string>();
    const categories = new Set<string>();
    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data, error } = await db(ctx)
        .from("products")
        .select("brand,category")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error(`Gagal memuat pilihan: ${error.message}`);
      for (const r of data ?? []) {
        if (r.brand) brands.add(String(r.brand));
        if (r.category) categories.add(String(r.category));
      }
      if (!data || data.length < 1000) break;
    }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "id"));
    return { brands: sort(brands), categories: sort(categories) };
  });

export const createQuickDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: QuickProductInput) => {
    if (!input || typeof input !== "object") throw new Error("Data produk tidak valid.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const role = await requirePermission(ctx, "products_edit");
    const clean = cleanQuickProduct(data, role);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sku = clean.sku ?? temporarySku();
      const { data: row, error } = await db(ctx)
        .from("products")
        .insert({
          name: clean.name,
          brand: clean.brand,
          category: clean.category,
          subcategory: "Lainnya",
          sku,
          price: clean.price,
          stock: clean.stock,
          weight_grams: clean.weight_grams,
          is_active: false,
        })
        .select("id,sku")
        .single();
      if (!error) {
        await audit(ctx, "db_product_create", row.id as string, { sku, quick: true });
        return { id: row.id as string, sku: row.sku as string };
      }
      const kind = classifyInsertError(String(error.message ?? ""));
      // SKU sementara bentrok: coba lagi dengan SKU baru. SKU buatan staf tidak diganti diam-diam.
      if (kind === "sku" && !clean.sku) continue;
      throw new Error(insertErrorMessage(kind, String(error.message ?? ""), sku));
    }
    throw new Error("Gagal membuat SKU sementara. Coba lagi.");
  });
