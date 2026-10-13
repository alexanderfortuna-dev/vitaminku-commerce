import { toast } from "sonner";

export const SHOPIFY_API_VERSION = "2026-07";
export const SHOPIFY_STORE_PERMANENT_DOMAIN = "vitaminku-commerce-u8xhy-ja6xbxet.myshopify.com";
export const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
// Legacy (the store reads products from Supabase). Token is env-driven; never hard-code it.
export const SHOPIFY_STOREFRONT_TOKEN: string =
  (import.meta.env?.["VITE_SHOPIFY_STOREFRONT_TOKEN"] as string | undefined) ?? "";

export interface ShopifyVariant {
  id: string;
  title: string;
  price: { amount: string; currencyCode: string };
  compareAtPrice?: { amount: string; currencyCode: string } | null;
  availableForSale: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  description: string;
  descriptionHtml?: string;
  handle: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  availableForSale?: boolean;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice?: { amount: string; currencyCode: string };
  };
  compareAtPriceRange?: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  images: { edges: Array<{ node: { url: string; altText: string | null } }> };
  variants: { edges: Array<{ node: ShopifyVariant }> };
  options: Array<{ name: string; values: string[] }>;
}

export interface ShopifyProduct {
  node: ShopifyProductNode;
}

const PRODUCT_FIELDS = `
  id
  title
  description
  descriptionHtml
  handle
  vendor
  productType
  tags
  availableForSale
  priceRange {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
  compareAtPriceRange { minVariantPrice { amount currencyCode } }
  images(first: 6) { edges { node { url altText } } }
  variants(first: 25) {
    edges {
      node {
        id
        title
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
        availableForSale
        selectedOptions { name value }
      }
    }
  }
  options { name values }
`;

export const STOREFRONT_PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $query: String, $sortKey: ProductSortKeys, $reverse: Boolean, $after: String) {
    products(first: $first, query: $query, sortKey: $sortKey, reverse: $reverse, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${PRODUCT_FIELDS} } }
    }
  }
`;

export const STOREFRONT_PRODUCT_QUERY = `
  query GetProduct($handle: String!) {
    product(handle: $handle) { ${PRODUCT_FIELDS} }
  }
`;

export class ShopifyRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ShopifyRequestError";
    this.status = status;
  }
}

let paymentToastShown = false;

export async function storefrontApiRequest(query: string, variables: Record<string, unknown> = {}) {
  if (!SHOPIFY_STOREFRONT_TOKEN) throw new Error("Shopify Storefront tidak dikonfigurasi.");
  const response = await fetch(SHOPIFY_STOREFRONT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 402) {
    if (!paymentToastShown) {
      paymentToastShown = true;
      toast.error("Shopify: pembayaran diperlukan", {
        description:
          "Akses API Shopify butuh paket berbayar aktif. Buka admin.shopify.com untuk upgrade.",
      });
    }
    throw new ShopifyRequestError("402 — paket Shopify belum aktif", 402);
  }

  if (!response.ok) {
    throw new ShopifyRequestError(`HTTP error! status: ${response.status}`, response.status);
  }

  const data = await response.json();
  if (data.errors) {
    throw new ShopifyRequestError(
      `Error calling Shopify: ${data.errors.map((e: { message: string }) => e.message).join(", ")}`,
      response.status,
    );
  }
  return data;
}

/**
 * Shopify's search syntax treats characters like `:`, `(`, `"`, `*` and the words
 * AND/OR/NOT as operators. Customer text is plain language, so strip those before
 * sending it, otherwise an ordinary query can fail or return nothing.
 */
export function sanitizeSearchQuery(input: string): string {
  const cleaned = input
    .replace(/[:()[\]{}"'*~^\\/<>=!&|+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .filter((word) => !["AND", "OR", "NOT"].includes(word.toUpperCase()))
    .join(" ");
}

/** First variant that can actually be bought, or null when everything is sold out. */
export function pickPurchasableVariant(node: ShopifyProductNode): ShopifyVariant | null {
  const variants = node.variants.edges.map((edge) => edge.node);
  return variants.find((v) => v.availableForSale) ?? null;
}

export type SortOption = "relevance" | "best_selling" | "price_asc" | "price_desc" | "newest";

const SORT_MAP: Record<SortOption, { sortKey?: string; reverse?: boolean }> = {
  relevance: { sortKey: "RELEVANCE" },
  best_selling: { sortKey: "BEST_SELLING" },
  price_asc: { sortKey: "PRICE", reverse: false },
  price_desc: { sortKey: "PRICE", reverse: true },
  newest: { sortKey: "CREATED_AT", reverse: true },
};

export async function fetchProducts(options?: {
  first?: number;
  query?: string;
  sort?: SortOption;
}): Promise<ShopifyProduct[]> {
  const sort = SORT_MAP[options?.sort ?? "best_selling"];
  const data = await storefrontApiRequest(STOREFRONT_PRODUCTS_QUERY, {
    first: options?.first ?? 24,
    query: options?.query || null,
    sortKey: sort.sortKey,
    reverse: sort.reverse ?? false,
  });
  return (data?.data?.products?.edges ?? []) as ShopifyProduct[];
}

export async function fetchProduct(handle: string): Promise<ShopifyProductNode | null> {
  const data = await storefrontApiRequest(STOREFRONT_PRODUCT_QUERY, { handle });
  return (data?.data?.product ?? null) as ShopifyProductNode | null;
}

export function productsQueryOptions(options?: {
  first?: number;
  query?: string;
  sort?: SortOption;
}) {
  return {
    queryKey: [
      "products",
      options?.query ?? "",
      options?.sort ?? "best_selling",
      options?.first ?? 24,
    ],
    queryFn: () => fetchProducts(options),
    staleTime: 60_000,
  };
}

/**
 * Cheap reachability probe for the store banner. Using this instead of a second
 * product fetch keeps every page from issuing a duplicate catalog request.
 */
export function storeStatusQueryOptions() {
  return {
    queryKey: ["store-status"],
    queryFn: async () => {
      const data = await storefrontApiRequest(`query ShopStatus { shop { name } }`);
      return { name: (data?.data?.shop?.name ?? "") as string };
    },
    retry: false,
    staleTime: 5 * 60_000,
  };
}

export function productQueryOptions(handle: string) {
  return {
    queryKey: ["product", handle],
    queryFn: () => fetchProduct(handle),
    staleTime: 60_000,
  };
}
export async function fetchProductsByHandles(handles: string[]): Promise<ShopifyProduct[]> {
  const unique = Array.from(new Set(handles)).filter(Boolean);
  if (unique.length === 0) return [];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 20) batches.push(unique.slice(i, i + 20));
  const results = await Promise.all(
    batches.map((batch) =>
      storefrontApiRequest(STOREFRONT_PRODUCTS_QUERY, {
        first: batch.length * 5,
        query: batch.map((h) => `handle:${h}`).join(" OR "),
        sortKey: "RELEVANCE",
        reverse: false,
      }),
    ),
  );
  const found = results.flatMap((data) => (data?.data?.products?.edges ?? []) as ShopifyProduct[]);
  const wanted = new Set(unique);
  const seen = new Set<string>();
  return found.filter((p) => {
    if (!wanted.has(p.node.handle) || seen.has(p.node.handle)) return false;
    seen.add(p.node.handle);
    return true;
  });
}

export interface ProductPage {
  products: ShopifyProduct[];
  endCursor: string | null;
  hasNextPage: boolean;
}

/** One cursor page of products, so listing pages can offer "Muat lagi". */
export async function fetchProductsPage(options: {
  first?: number;
  query?: string;
  sort?: SortOption;
  after?: string | null;
}): Promise<ProductPage> {
  const sort = SORT_MAP[options.sort ?? "best_selling"];
  const data = await storefrontApiRequest(STOREFRONT_PRODUCTS_QUERY, {
    first: options.first ?? 12,
    query: options.query || null,
    sortKey: sort.sortKey,
    reverse: sort.reverse ?? false,
    after: options.after ?? null,
  });
  const connection = data?.data?.products;
  return {
    products: (connection?.edges ?? []) as ShopifyProduct[],
    endCursor: (connection?.pageInfo?.endCursor ?? null) as string | null,
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
  };
}

export function productsInfiniteQueryOptions(options: {
  pageSize?: number;
  query?: string;
  sort?: SortOption;
}) {
  const pageSize = options.pageSize ?? 12;
  return {
    queryKey: ["products-page", options.query ?? "", options.sort ?? "best_selling", pageSize],
    queryFn: ({ pageParam }: { pageParam?: string | null }) =>
      fetchProductsPage({ first: pageSize, ...options, after: pageParam ?? null }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ProductPage) => (last.hasNextPage ? last.endCursor : undefined),
    staleTime: 60_000,
  };
}

/** Removes repeats that can appear across cursor pages when the catalog shifts. */
export function dedupeProducts(products: ShopifyProduct[]): ShopifyProduct[] {
  const seen = new Set<string>();
  return products.filter((p) => {
    if (seen.has(p.node.id)) return false;
    seen.add(p.node.id);
    return true;
  });
}

/** Asks Shopify's CDN for a mobile-sized image instead of the full-size original. */
export function shopifyImageUrl(url: string | undefined, width: number): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("width", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}

export function productsByHandlesQueryOptions(handles: string[]) {
  const sorted = Array.from(new Set(handles)).sort();
  return {
    queryKey: ["products-by-handles", sorted.join(",")],
    queryFn: () => fetchProductsByHandles(sorted),
    staleTime: 60_000,
  };
}
