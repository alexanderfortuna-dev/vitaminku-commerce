import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";
import { ProductGrid } from "@/components/ProductRail";
import { LoadMore } from "@/components/LoadMore";
import { GOALS, getGoal } from "@/lib/catalog";
import { dedupeProducts, productsInfiniteQueryOptions } from "@/lib/catalog-db";

export const Route = createFileRoute("/tujuan/$slug")({
  loader: ({ params }) => {
    const goal = getGoal(params.slug);
    if (!goal) throw notFound();
    return { name: goal.name, description: goal.description };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Tujuan tidak ditemukan — VitaminKu" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${loaderData.name} — VitaminKu`;
    return {
      meta: [
        { title },
        { name: "description", content: loaderData.description },
        { property: "og:title", content: title },
        { property: "og:description", content: loaderData.description },
        { property: "og:url", content: `/tujuan/${params.slug}` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: `/tujuan/${params.slug}` }],
    };
  },
  errorComponent: ({ error }) => (
    <p role="alert" className="px-4 py-10 text-sm text-muted-foreground">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  notFoundComponent: () => (
    <p className="px-4 py-10 text-sm text-muted-foreground">Tujuan tidak ditemukan.</p>
  ),
  component: GoalPage,
});

function GoalPage() {
  const { slug } = Route.useParams();
  const goal = getGoal(slug);
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    ...productsInfiniteQueryOptions({ subcategories: goal?.subcategories ?? [], sort: "name" }),
    enabled: Boolean(goal),
  });

  if (!goal) return null;
  const products = dedupeProducts((data?.pages ?? []).flatMap((p) => p.products));

  return (
    <div className="pb-8">
      <div className="soft-gradient px-4 py-5">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Beranda
          </Link>
          <span> / </span>
          <Link to="/tujuan" className="hover:text-primary">
            Kebutuhan
          </Link>
        </nav>
        <h1 className="mt-2 text-xl font-extrabold">{goal.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{goal.description}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
        {GOALS.map((g) => (
          <Link
            key={g.slug}
            to="/tujuan/$slug"
            params={{ slug: g.slug }}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${
              g.slug === slug ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"
            }`}
          >
            {g.name}
          </Link>
        ))}
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
          <h2 className="mt-3 text-base font-bold">Belum ada produk untuk kebutuhan ini</h2>
        </div>
      )}
    </div>
  );
}
