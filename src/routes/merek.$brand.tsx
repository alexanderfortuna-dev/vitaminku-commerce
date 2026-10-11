import { Link, createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";
import { ProductGrid } from "@/components/ProductRail";
import { LoadMore } from "@/components/LoadMore";
import { dedupeProducts, productsInfiniteQueryOptions } from "@/lib/catalog-db";

export const Route = createFileRoute("/merek/$brand")({
  head: ({ params }) => {
    const brand = decodeURIComponent(params.brand);
    const title = `${brand} — VitaminKu`;
    const description = `Produk ${brand} yang tersedia di katalog VitaminKu.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: `/merek/${params.brand}` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: `/merek/${params.brand}` }],
    };
  },
  component: BrandPage,
});

function BrandPage() {
  const { brand: raw } = Route.useParams();
  const brand = decodeURIComponent(raw);
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(
    productsInfiniteQueryOptions({ brand, sort: "name" }),
  );
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
          <Link to="/merek" className="hover:text-primary">
            Merek
          </Link>
        </nav>
        <h1 className="mt-2 text-lg font-extrabold">{brand}</h1>
        <p className="text-sm text-muted-foreground">
          {isPending ? "Memuat…" : `${total ?? products.length} produk`}
        </p>
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
          <h2 className="mt-3 text-base font-bold">Belum ada produk untuk merek ini</h2>
          <Link
            to="/merek"
            className="mt-4 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Lihat Merek Lain
          </Link>
        </div>
      )}
    </div>
  );
}
