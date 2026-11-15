import { QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbProduct } from "@/lib/catalog.functions";

vi.mock("@/lib/catalog.functions", () => ({
  PAGE_SIZE: 24,
  listProducts: vi.fn(),
  listBrands: vi.fn(async () => []),
  getCatalogStatus: vi.fn(),
  getProductBySlug: vi.fn(),
  getProductsBySlugs: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/stores/wishlistStore", () => ({
  useWishlistStore: (sel: (s: { handles: string[]; toggle: () => void }) => unknown) =>
    sel({ handles: [], toggle: () => undefined }),
}));

vi.mock("@/hooks/useRunningPromos", () => ({ useRunningPromos: () => [] }));

vi.mock("@/stores/cartStore", () => ({
  useCartStore: Object.assign(() => ({ items: [] }), { getState: () => ({ addItem: () => true, items: [] }) }),
}));

import { listBrands, listProducts } from "@/lib/catalog.functions";
import { productsInfiniteQueryOptions, productsQueryOptions } from "@/lib/catalog-db";
import { HOME_NEWEST, prefetchFirstPage, prefetchHomeCatalog } from "@/lib/catalog-ssr";
import { ProductCard } from "@/components/ProductCard";

const vitamin: DbProduct = {
  id: "p-ssr",
  sku: "SSR-1",
  name: "Vitamin C Uji SSR",
  brand: "Uji",
  category: "Vitamin & Suplemen",
  subcategory: "Vitamin C",
  size: null,
  pack_count: null,
  servings: null,
  dose: null,
  flavor: null,
  price: 150000,
  compare_at_price: null,
  stock: 4,
  image_url: null,
  description: null,
  bpom_number: null,
  slug: "vitamin-c-uji-ssr",
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("render server katalog", () => {
  beforeEach(() => {
    vi.mocked(listProducts).mockReset();
    vi.mocked(listBrands).mockReset();
    vi.mocked(listBrands).mockResolvedValue([]);
    vi.mocked(listProducts).mockResolvedValue({ products: [vitamin], total: 1, nextOffset: null });
  });

  it("beranda memuat nama produk ke cache, dan HTML memuat nama itu", async () => {
    const queryClient = client();
    await prefetchHomeCatalog(queryClient);
    const cached = queryClient.getQueryData(productsQueryOptions(HOME_NEWEST).queryKey) as { products: DbProduct[] };
    expect(cached.products.map((p) => p.name)).toContain("Vitamin C Uji SSR");
    const html = renderToStaticMarkup(<ProductCard product={vitamin} />);
    expect(html).toContain("Vitamin C Uji SSR");
    expect(html).not.toContain("Memuat…");
  });

  it("halaman pertama pencarian ikut di-prefetch", async () => {
    const queryClient = client();
    const input = { search: "vitamin", sort: "name" as const };
    await prefetchFirstPage(queryClient, input);
    const cached = queryClient.getQueryData(productsInfiniteQueryOptions(input).queryKey) as {
      pages: Array<{ products: DbProduct[] }>;
    };
    expect(cached.pages[0]!.products[0]!.name).toBe("Vitamin C Uji SSR");
  });

  it("gagal memuat di server tidak melempar; cache berstatus error supaya halaman bisa coba lagi", async () => {
    vi.mocked(listProducts).mockRejectedValue(new Error("katalog down"));
    const queryClient = client();
    await expect(prefetchHomeCatalog(queryClient)).resolves.toBeUndefined();
    expect(queryClient.getQueryState(productsQueryOptions(HOME_NEWEST).queryKey)?.status).toBe("error");
  });
});
