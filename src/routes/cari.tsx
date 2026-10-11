import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SearchX } from "lucide-react";
import { SearchInput } from "@/components/SearchInput";
import { ProductGrid } from "@/components/ProductRail";
import { LoadMore } from "@/components/LoadMore";
import {
  SORT_LABELS,
  dedupeProducts,
  productsInfiniteQueryOptions,
  type CatalogSort,
} from "@/lib/catalog-db";
import { POPULAR_SEARCHES } from "@/lib/catalog";

export const Route = createFileRoute("/cari")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? (search["q"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "Cari Vitamin & Suplemen — VitaminKu" },
      {
        name: "description",
        content: "Cari vitamin, suplemen, dan sports nutrition dengan cepat di VitaminKu.",
      },
      { property: "og:title", content: "Cari Vitamin & Suplemen — VitaminKu" },
      {
        property: "og:description",
        content: "Temukan produk kesehatan dalam hitungan detik.",
      },
      { property: "og:url", content: "/cari" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/cari" }],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const [sort, setSort] = useState<CatalogSort>("name");
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    ...productsInfiniteQueryOptions({ search: q, sort }),
    enabled: q.trim().length > 0,
  });
  const products = dedupeProducts((data?.pages ?? []).flatMap((p) => p.products));
  const total = data?.pages[0]?.total ?? null;

  return (
    <div className="pb-6">
      <div className="px-4 py-4">
        <h1 className="mb-3 text-lg font-extrabold">Cari Produk</h1>
        <SearchInput initialValue={q} />
      </div>

      {q ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {isPending ? "Memuat…" : `${total ?? products.length} hasil untuk `}
              <span className="font-semibold text-navy">“{q}”</span>
            </p>
            <label className="shrink-0 text-xs">
              <span className="sr-only">Urutkan</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as CatalogSort)}
                className="max-w-[55vw] rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-navy"
              >
                {SORT_LABELS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isPending ? (
            <ProductGrid products={[]} isLoading />
          ) : products.length > 0 ? (
            <>
              <ProductGrid products={products} />
              <LoadMore
                count={products.length}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={() => void fetchNextPage()}
              />
            </>
          ) : (
            <div className="px-4 py-10 text-center">
              <SearchX className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-3 text-base font-bold">Produk tidak ditemukan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Coba kata kunci lain atau lihat pencarian populer di bawah.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {POPULAR_SEARCHES.map((s) => (
                  <Link
                    key={s}
                    to="/cari"
                    search={{ q: s }}
                    className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-navy"
                  >
                    {s}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="px-4">
          <p className="pb-2 text-xs font-semibold text-muted-foreground">Pencarian populer</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_SEARCHES.map((s) => (
              <Link
                key={s}
                to="/cari"
                search={{ q: s }}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-navy"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
