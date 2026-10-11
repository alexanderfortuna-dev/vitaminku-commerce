import {
  PAGE_SIZE,
  getCatalogStatus,
  getProductBySlug,
  getProductsBySlugs,
  listBrands,
  listProducts,
  type CatalogSort,
  type DbProduct,
  type ListInput,
  type ProductPage,
} from "@/lib/catalog.functions";

export { PAGE_SIZE };
export type { CatalogSort, DbProduct, ProductPage };

export const SORT_LABELS: Array<{ value: CatalogSort; label: string }> = [
  { value: "name", label: "Nama A–Z" },
  { value: "newest", label: "Terbaru" },
  { value: "price_asc", label: "Harga Terendah" },
  { value: "price_desc", label: "Harga Tertinggi" },
];

export function productSlug(product: DbProduct): string {
  return product.slug ?? product.id;
}

export function hasPrice(product: DbProduct): boolean {
  return product.price !== null && Number.isFinite(Number(product.price));
}

/** Buyable online: priced above 0 and in stock (storefront reads already exclude inactive/blocked). */
export function isBuyable(product: DbProduct): boolean {
  return hasPrice(product) && Number(product.price) > 0 && product.stock > 0;
}

/** Brand initials for the neutral placeholder shown while images are missing. */
export function brandInitials(product: DbProduct): string {
  const source = product.brand || product.name || "?";
  const words = source.split(/[\s-]+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((w) => w[0]!)
      .join("") || "?"
  ).toUpperCase();
}

export function productsQueryOptions(input: ListInput) {
  return {
    queryKey: ["db-products", input],
    queryFn: () => listProducts({ data: input }),
    staleTime: 60_000,
  };
}

export function productsInfiniteQueryOptions(input: Omit<ListInput, "offset">) {
  return {
    queryKey: ["db-products-page", input],
    queryFn: ({ pageParam }: { pageParam?: number }) =>
      listProducts({ data: { ...input, offset: pageParam ?? 0, limit: input.limit ?? PAGE_SIZE } }),
    initialPageParam: 0,
    getNextPageParam: (last: ProductPage) => last.nextOffset ?? undefined,
    staleTime: 60_000,
  };
}

export function productQueryOptions(slug: string) {
  return {
    queryKey: ["db-product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
    staleTime: 60_000,
  };
}

export function productsBySlugsQueryOptions(slugs: string[]) {
  const sorted = Array.from(new Set(slugs)).sort();
  return {
    queryKey: ["db-products-by-slug", sorted.join(",")],
    queryFn: () => getProductsBySlugs({ data: { slugs: sorted } }),
    staleTime: 60_000,
  };
}

export function brandsQueryOptions() {
  return { queryKey: ["db-brands"], queryFn: () => listBrands(), staleTime: 10 * 60_000 };
}

export function catalogStatusQueryOptions() {
  return {
    queryKey: ["catalog-status"],
    queryFn: () => getCatalogStatus(),
    retry: false,
    staleTime: 5 * 60_000,
  };
}

export function dedupeProducts(products: DbProduct[]): DbProduct[] {
  const seen = new Set<string>();
  return products.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/** Short spec line built only from fields that are actually filled in. */
export function productSpecLine(product: DbProduct): string {
  return [product.size, product.pack_count, product.servings, product.dose, product.flavor]
    .filter((v) => v && String(v).trim())
    .join(" · ");
}
