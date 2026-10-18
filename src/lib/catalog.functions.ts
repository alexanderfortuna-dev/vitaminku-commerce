import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const PAGE_SIZE = 24;

export interface DbProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  size: string | null;
  pack_count: string | null;
  servings: string | null;
  dose: string | null;
  flavor: string | null;
  price: number | null;
  compare_at_price: number | null;
  stock: number;
  image_url: string | null;
  description: string | null;
  bpom_number: string | null;
  slug: string | null;
  is_hero?: boolean;
}

export interface ProductPage {
  products: DbProduct[];
  nextOffset: number | null;
  total: number | null;
}

export type CatalogSort = "name" | "newest" | "price_asc" | "price_desc";

const SELECT_COLUMNS =
  "id,sku,name,brand,category,subcategory,size,pack_count,servings,dose,flavor,price,compare_at_price,stock,image_url,description,bpom_number,slug,is_hero";

function publicClient() {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

/** Strips characters that would break a Postgres text-search / ILIKE pattern. */
export function sanitizeSearchQuery(input: string): string {
  return input
    .replace(/[%_&|!():*'"\\<>=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ListInput {
  category?: string | undefined;
  subcategories?: string[] | undefined;
  brand?: string | undefined;
  search?: string | undefined;
  sort?: CatalogSort | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
  /** Only products that can be bought now (used by home rails). */
  purchasableOnly?: boolean | undefined;
  /** Only products staff marked as Hero (home "Promo Pilihan"). */
  heroOnly?: boolean | undefined;
}

function applySort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  sort: CatalogSort,
  withImageRank = true,
) {
  // Purchasable (price > 0 and stock > 0) always first; "Harga menyusul" last.
  query = query.order("is_purchasable", { ascending: false });
  switch (sort) {
    case "newest":
      return (withImageRank ? query.order("has_image", { ascending: false }) : query).order("created_at", { ascending: false });
    case "price_asc":
      return query.order("price", { ascending: true, nullsFirst: false }).order("name");
    case "price_desc":
      return query.order("price", { ascending: false, nullsFirst: false }).order("name");
    default:
      // Produk berfoto lebih dulu; yang masih memakai gambar pengganti di bawahnya (urutan harga tidak diubah).
      return (withImageRank ? query.order("has_image", { ascending: false }) : query).order("name", { ascending: true });
  }
}

export const listProducts = createServerFn({ method: "GET" })
  .inputValidator((data: ListInput) => data ?? {})
  .handler(async ({ data }): Promise<ProductPage> => {
    const supabase = publicClient();
    const limit = Math.min(Math.max(data.limit ?? PAGE_SIZE, 1), 48);
    const offset = Math.max(data.offset ?? 0, 0);
    const search = sanitizeSearchQuery(data.search ?? "");

    let query = supabase
      .from("products")
      .select(SELECT_COLUMNS, { count: "exact" })
      .eq("is_active", true)
      .eq("is_blocked", false);

    if (data.category) query = query.eq("category", data.category);
    if (data.subcategories?.length) query = query.in("subcategory", data.subcategories);
    if (data.brand) query = query.eq("brand", data.brand);
    if (data.purchasableOnly) query = query.eq("is_purchasable", true);
    if (data.heroOnly) query = query.eq("is_hero", true);

    if (search) {
      // Uses the GIN index on to_tsvector('simple', name) first, then falls back
      // to a plain ILIKE match across name/brand/category/subcategory.
      const terms = search.split(" ").join(" & ");
      const { data: ftsRows } = await supabase
        .from("products")
        .select("id")
        .eq("is_active", true)
      .eq("is_blocked", false)
        .textSearch("name", terms, { config: "simple" })
        .limit(1);
      if (ftsRows && ftsRows.length > 0) {
        query = query.textSearch("name", terms, { config: "simple" });
      } else {
        const like = `%${search}%`;
        query = query.or(
          `name.ilike.${like},brand.ilike.${like},category.ilike.${like},subcategory.ilike.${like}`,
        );
      }
    }

    const sortKey = data.sort ?? "name";
    const base = query;
    query = applySort(base, sortKey).range(offset, offset + limit - 1);

    let { data: rows, count, error } = await query;
    if (error && /has_image/.test(error.message)) {
      // Migrasi 0014 belum diterapkan: tampilkan katalog tanpa urutan foto, jangan gagal.
      ({ data: rows, count, error } = await applySort(base, sortKey, false).range(offset, offset + limit - 1));
    }
    if (error) throw new Error(error.message);
    const products = (rows ?? []) as unknown as DbProduct[];
    const nextOffset = products.length === limit ? offset + limit : null;
    return { products, nextOffset, total: count ?? null };
  });

export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<DbProduct | null> => {
    const supabase = publicClient();
    const { data: rows, error } = await supabase
      .from("products")
      .select(SELECT_COLUMNS)
      .eq("is_active", true)
      .eq("is_blocked", false)
      .eq("slug", data.slug)
      .limit(1);
    if (error) throw new Error(error.message);
    return (rows?.[0] as unknown as DbProduct | undefined) ?? null;
  });

export const getProductsBySlugs = createServerFn({ method: "GET" })
  .inputValidator((data: { slugs: string[] }) => data)
  .handler(async ({ data }): Promise<DbProduct[]> => {
    const slugs = Array.from(new Set(data.slugs.filter(Boolean))).slice(0, 60);
    if (slugs.length === 0) return [];
    const supabase = publicClient();
    const { data: rows, error } = await supabase
      .from("products")
      .select(SELECT_COLUMNS)
      .eq("is_active", true)
      .eq("is_blocked", false)
      .in("slug", slugs);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as DbProduct[];
  });

export interface BrandEntry {
  brand: string;
  count: number;
}

export const listBrands = createServerFn({ method: "GET" }).handler(
  async (): Promise<BrandEntry[]> => {
    const supabase = publicClient();
    const counts = new Map<string, number>();
    const pageSize = 1000;
    for (let offset = 0; offset < 5000; offset += pageSize) {
      const { data: rows, error } = await supabase
        .from("products")
        .select("brand")
        .eq("is_active", true)
      .eq("is_blocked", false)
        .order("brand")
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      for (const row of rows ?? []) {
        const brand = (row as { brand: string }).brand?.trim();
        if (!brand) continue;
        counts.set(brand, (counts.get(brand) ?? 0) + 1);
      }
      if (!rows || rows.length < pageSize) break;
    }
    return Array.from(counts.entries())
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => a.brand.localeCompare(b.brand, "id"));
  },
);

/** Cheap reachability probe for the catalog banner. */
export const getCatalogStatus = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
      .eq("is_blocked", false);
  if (error) throw new Error(error.message);
  return { count: count ?? 0 };
});

/**
 * Server-side order quote. Accepts only slugs + quantities; every price is read
 * from the database here, so the browser can never set what an order costs.
 */
export const quoteOrder = createServerFn({ method: "POST" })
  .inputValidator((data: { lines: Array<{ slug: string; quantity: number }> }) => {
    if (!data || !Array.isArray(data.lines)) throw new Error("Format pesanan tidak valid.");
    return {
      lines: data.lines.slice(0, 60).map((l) => ({
        slug: String(l.slug ?? ""),
        quantity: Number(l.quantity),
      })),
    };
  })
  .handler(async ({ data }) => {
    const { quoteOrderLines } = await import("./order-pricing");
    const slugs = Array.from(new Set(data.lines.map((l) => l.slug).filter(Boolean)));
    if (slugs.length === 0) return quoteOrderLines([], []);
    const supabase = publicClient();
    const { data: rows, error } = await supabase
      .from("products")
      .select("slug,name,price,stock,is_active,is_blocked")
      .in("slug", slugs);
    if (error) throw new Error(error.message);
    return quoteOrderLines(data.lines, (rows ?? []) as never);
  });
