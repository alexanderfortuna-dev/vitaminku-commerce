import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PackageSearch } from "lucide-react";
import { ProductGrid } from "@/components/ProductRail";
import { LoadMore } from "@/components/LoadMore";
import { getCategory } from "@/lib/catalog";
import {
  SORT_LABELS,
  dedupeProducts,
  productsInfiniteQueryOptions,
  type CatalogSort,
} from "@/lib/catalog-db";

export const Route = createFileRoute("/kategori/$slug")({
  loader: ({ params }) => {
    const category = getCategory(params.slug);
    if (!category) throw notFound();
    return { name: category.name, blurb: category.blurb };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Kategori tidak ditemukan — VitaminKu" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${loaderData.name} — VitaminKu`;
    return {
      meta: [
        { title },
        { name: "description", content: `${loaderData.blurb}. Katalog VitaminKu.` },
        { property: "og:title", content: title },
        { property: "og:description", content: loaderData.blurb },
        { property: "og:url", content: `/kategori/${params.slug}` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: `/kategori/${params.slug}` }],
    };
  },
  errorComponent: ({ error }) => (
    <p role="alert" className="px-4 py-10 text-sm text-muted-foreground">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  notFoundComponent: () => (
    <p className="px-4 py-10 text-sm text-muted-foreground">Kategori tidak ditemukan.</p>
  ),
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const category = getCategory(slug);
  const [sort, setSort] = useState<CatalogSort>("name");
  const [subcategory, setSubcategory] = useState<string | null>(null);

  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    ...productsInfiniteQueryOptions({
      category: category?.category ?? "",
      subcategories: subcategory ? [subcategory] : undefined,
      sort,
    }),
    enabled: Boolean(category),
  });

  if (!category) return null;
  const products = dedupeProducts((data?.pages ?? []).flatMap((p) => p.products));
  const total = data?.pages[0]?.total ?? null;

  return (
    <div className="pb-8">
      <div className="px-4 py-4">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Beranda
          </Link>
          <span> / </span>
          <Link to="/kategori" className="hover:text-primary">
            Kategori
          </Link>
        </nav>
        <h1 className="mt-2 text-lg font-extrabold">{category.name}</h1>
        <p className="text-sm text-muted-foreground">{category.blurb}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar">
        <button
          type="button"
          onClick={() => setSubcategory(null)}
          className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${
            subcategory === null ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"
          }`}
        >
          Semua
        </button>
        {category.subcategories.map((sub) => (
          <button
            key={sub}
            type="button"
            onClick={() => setSubcategory(sub)}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${
              subcategory === sub ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"
            }`}
          >
            {sub}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3">
        <p className="text-xs text-muted-foreground">
          {isPending ? "Memuat…" : `${total ?? products.length} produk`}
        </p>
        <label className="text-xs">
          <span className="sr-only">Urutkan</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CatalogSort)}
            className="max-w-[60vw] rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-navy"
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
          <PackageSearch className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-bold">Belum ada produk di filter ini</h2>
          <Link
            to="/kategori"
            className="mt-4 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Lihat Kategori Lain
          </Link>
        </div>
      )}
    </div>
  );
}
