// Admin product management against the database catalog the storefront reads.
// Every write runs as the signed-in user (RLS enforced) after a server role check.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requireRole, type Ctx } from "./admin.functions";
import { ROLE_LEVEL } from "./admin-roles";

export const ADMIN_PAGE_SIZE = 30;

export interface AdminDbProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  size: string | null;
  flavor: string | null;
  price: number | null;
  compare_at_price: number | null;
  stock: number;
  image_url: string | null;
  description: string | null;
  bpom_number: string | null;
  slug: string | null;
  is_active: boolean;
  is_blocked: boolean;
  blocked_reason: string | null;
  weight_grams: number | null;
  images: string[];
  variant_group: string | null;
  publish_issue: string | null;
  is_hero: boolean;
}

const COLUMNS =
  "weight_grams,images,variant_group,publish_issue,is_hero,id,sku,name,brand,category,subcategory,size,flavor,price,compare_at_price,stock,image_url,description,bpom_number,slug,is_active,is_blocked,blocked_reason";

export type AdminFilter = "ALL" | "ACTIVE" | "DRAFT" | "NO_IMAGE" | "BLOCKED";

// The generated types may lag behind new columns; keep the client loosely typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(ctx: Ctx): any {
  return ctx.supabase;
}

function fail(message: string | undefined): never {
  throw new Error(message ? `Database menolak perubahan: ${message}` : "Database menolak perubahan.");
}

function cleanSearch(s: string) {
  return s.replace(/[%_,()*\\]/g, " ").trim();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 80);
}

function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Harga tidak valid.");
  return Math.round(n);
}

export const listDbAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; filter?: AdminFilter; offset?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "seller");
    const offset = Math.max(0, data.offset ?? 0);
    let q = db(ctx).from("products").select(COLUMNS, { count: "exact" });
    const search = cleanSearch(data.search ?? "");
    if (search) {
      const like = `%${search}%`;
      q = q.or(`name.ilike.${like},sku.ilike.${like},brand.ilike.${like}`);
    }
    switch (data.filter) {
      case "ACTIVE":
        q = q.eq("is_active", true);
        break;
      case "DRAFT":
        q = q.eq("is_active", false).eq("is_blocked", false);
        break;
      case "NO_IMAGE":
        q = q.is("image_url", null);
        break;
      case "BLOCKED":
        q = q.eq("is_blocked", true);
        break;
    }
    const { data: rows, count, error } = await q
      .order("name")
      .range(offset, offset + ADMIN_PAGE_SIZE - 1);
    if (error) fail(error.message);
    const products = (rows ?? []) as AdminDbProduct[];
    return {
      products,
      total: (count as number | null) ?? null,
      nextOffset: products.length === ADMIN_PAGE_SIZE ? offset + ADMIN_PAGE_SIZE : null,
    };
  });

export const getDbAdminProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const role = await requireRole(ctx, "seller");
    const { data: row, error } = await db(ctx)
      .from("products")
      .select(COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) fail(error.message);
    return { product: (row ?? null) as AdminDbProduct | null, role };
  });

export interface DbProductUpdate {
  id: string;
  name?: string;
  description?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  size?: string;
  flavor?: string;
  bpom_number?: string;
  weight_grams?: string | number | null;
  // admin/owner only
  sku?: string;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  stock?: number;
  is_active?: boolean;
  is_hero?: boolean;
}

const CONTENT_FIELDS = [
  "name",
  "description",
  "brand",
  "category",
  "subcategory",
  "size",
  "flavor",
  "bpom_number",
] as const;

export const updateDbAdminProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DbProductUpdate) => {
    if (!input?.id) throw new Error("Produk tidak valid.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const role = await requireRole(ctx, "seller");
    const patch: Record<string, unknown> = {};
    for (const key of CONTENT_FIELDS) {
      if (data[key] !== undefined) patch[key] = String(data[key]).trim() || null;
    }
    if (patch["name"] === null) throw new Error("Nama produk wajib diisi.");
    if (data.weight_grams !== undefined) {
      const raw = String(data.weight_grams ?? "").replace(/\D/g, "");
      const w = raw === "" ? null : Number(raw);
      if (w !== null && !(w > 0)) throw new Error("Berat harus lebih dari 0 gram.");
      patch["weight_grams"] = w;
    }

    const commerceKeys = ["sku", "price", "compare_at_price", "stock", "is_active", "is_hero"] as const;
    const wantsCommerce = commerceKeys.some((k) => data[k] !== undefined);
    if (wantsCommerce && ROLE_LEVEL[role] < ROLE_LEVEL.admin) {
      throw new Error("403 — harga, SKU, stok, dan status hanya untuk admin/owner.");
    }
    if (data.sku !== undefined) patch["sku"] = data.sku.trim();
    if (data.price !== undefined) patch["price"] = parseMoney(data.price);
    if (data.compare_at_price !== undefined)
      patch["compare_at_price"] = parseMoney(data.compare_at_price);
    if (data.stock !== undefined) {
      const stock = Math.floor(Number(data.stock));
      if (!Number.isFinite(stock) || stock < 0) throw new Error("Stok tidak valid.");
      patch["stock"] = stock;
    }
    if (data.is_active !== undefined) patch["is_active"] = Boolean(data.is_active);
    if (data.is_hero !== undefined) patch["is_hero"] = Boolean(data.is_hero);
    if (patch["compare_at_price"] != null && patch["price"] != null && Number(patch["compare_at_price"]) <= Number(patch["price"]))
      throw new Error("Harga coret harus lebih tinggi dari harga jual (atau kosongkan).");
    if (Object.keys(patch).length === 0) return { ok: true, product: null };

    const { data: row, error } = await db(ctx)
      .from("products")
      .update(patch)
      .eq("id", data.id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) fail(error.message);
    if (!row) throw new Error("Produk tidak ditemukan atau akses ditolak.");
    await audit(ctx, "db_product_update", data.id, { fields: Object.keys(patch) });
    const product = row as AdminDbProduct;
    return { ok: true, product, blocked: product.is_blocked && data.is_active === true };
  });

export const createDbAdminProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { name: string; brand: string; category: string; subcategory: string; sku: string; price?: string }) => {
      if (!input?.name?.trim()) throw new Error("Nama produk wajib diisi.");
      if (!input.sku?.trim()) throw new Error("SKU wajib diisi.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const { data: row, error } = await db(ctx)
      .from("products")
      .insert({
        name: data.name.trim(),
        brand: data.brand.trim(),
        category: data.category.trim() || "Lain-lain (Non-Suplemen)",
        subcategory: data.subcategory.trim() || "Lainnya",
        sku: data.sku.trim(),
        price: parseMoney(data.price),
        stock: 0,
        is_active: false,
      })
      .select("id")
      .single();
    if (error) fail(error.message);
    await audit(ctx, "db_product_create", row.id as string, { sku: data.sku });
    return { id: row.id as string };
  });

export const bulkSetDbActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; active: boolean }) => {
    if (!input?.ids?.length) throw new Error("Tidak ada produk dipilih.");
    return { ids: input.ids.slice(0, 100), active: Boolean(input.active) };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const { data: rows, error } = await db(ctx)
      .from("products")
      .update({ is_active: data.active })
      .in("id", data.ids)
      .select("id,is_active,is_blocked");
    if (error) fail(error.message);
    const list = (rows ?? []) as Array<{ is_active: boolean; is_blocked: boolean }>;
    await audit(ctx, "db_bulk_status", null, { count: list.length, active: data.active });
    return { updated: list.length, blocked: list.filter((r) => r.is_blocked).length };
  });

const BUCKET = "product-images";

export const uploadDbProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; file: { name: string; type: string; base64: string } }) => {
    if (!input?.id || !input.file?.base64) throw new Error("Tidak ada gambar dipilih.");
    if (!/^image\/(jpeg|png|webp)$/.test(input.file.type)) throw new Error("Format gambar tidak didukung.");
    if (input.file.base64.length > 7_000_000) throw new Error("Gambar terlalu besar (maks ±5 MB).");
    return input;
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "seller");
    const { data: existing, error: readError } = await db(ctx)
      .from("products")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) fail(readError.message);
    if (!existing) throw new Error("Produk tidak ditemukan.");

    const ext = data.file.type === "image/png" ? "png" : data.file.type === "image/webp" ? "webp" : "jpg";
    const path = `${data.id}/${Date.now()}.${ext}`;
    const binary = Uint8Array.from(atob(data.file.base64), (c) => c.charCodeAt(0));
    // Storage write uses the server key only after the role check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, binary, { contentType: data.file.type, upsert: false });
    if (upError) throw new Error(`Upload gambar gagal: ${upError.message}`);
    // Bucket is private; the storefront gets a long-lived signed link (10 years).
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signError || !signed) throw new Error("Link gambar gagal dibuat.");
    const url = signed.signedUrl;

    const { error } = await db(ctx).from("products").update({ image_url: url }).eq("id", data.id);
    if (error) fail(error.message);
    await audit(ctx, "db_image_upload", data.id, { path });
    return { url };
  });

export const removeDbProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "seller");
    const { error } = await db(ctx).from("products").update({ image_url: null }).eq("id", data.id);
    if (error) fail(error.message);
    await audit(ctx, "db_image_remove", data.id, {});
    return { ok: true };
  });
