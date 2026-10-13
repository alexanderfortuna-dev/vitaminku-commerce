import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { Heart, ChevronLeft, ShieldCheck, Truck } from "lucide-react";
import { discountPercent, formatIDR } from "@/lib/format";
import {
  hasPrice,
  productQueryOptions,
  productSpecLine,
  productsQueryOptions,
} from "@/lib/catalog-db";
import { ProductThumb } from "@/components/ProductThumb";
import { useWishlistStore } from "@/stores/wishlistStore";
import { ProductRail } from "@/components/ProductRail";
import { useRunningPromos } from "@/hooks/useRunningPromos";
import { promoForBrand } from "@/lib/promo";
import { ProductBuyBar } from "@/components/AddToCartButton";
import { brandSlug } from "@/lib/catalog";
import { buildProductJsonLd, serializeJsonLd } from "@/lib/seo";

export const Route = createFileRoute("/produk/$handle")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData(productQueryOptions(params.handle));
    if (!product) throw notFound();
    return {
      title: product.name,
      description: product.description ?? "",
      brand: product.brand,
      subcategory: product.subcategory,
      // JSON-LD hanya bila produk punya harga > 0; tanpa rating/ulasan. Set VITE_SITE_URL agar url penawaran ikut.
      jsonLd: (() => {
        const ld = buildProductJsonLd(product, import.meta.env["VITE_SITE_URL"] as string | undefined);
        return ld ? serializeJsonLd(ld) : null;
      })(),
    };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Produk tidak tersedia — VitaminKu" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${loaderData.title} — VitaminKu`;
    const description = (
      loaderData.description || `${loaderData.title} dari ${loaderData.brand} di katalog VitaminKu.`
    ).slice(0, 155);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `/produk/${params.handle}` },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: `/produk/${params.handle}` }],
      ...(loaderData.jsonLd ? { scripts: [{ type: "application/ld+json", children: loaderData.jsonLd }] } : {}),
    };
  },
  errorComponent: ({ error }) => (
    <p role="alert" className="px-4 py-10 text-sm text-muted-foreground">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  notFoundComponent: () => (
    <p className="px-4 py-10 text-sm text-muted-foreground">Produk tidak ditemukan.</p>
  ),
  component: ProductPage,
});

function ProductPage() {
  const { handle } = Route.useParams();
  const { data: product } = useSuspenseQuery(productQueryOptions(handle));
  const wishlisted = useWishlistStore((s) => s.handles.includes(handle));
  const toggleWishlist = useWishlistStore((s) => s.toggle);

  const { data: relatedPage } = useQuery({
    ...productsQueryOptions({
      subcategories: product ? [product.subcategory] : undefined,
      sort: "name",
      limit: 10,
    }),
    enabled: Boolean(product),
  });

  const promos = useRunningPromos();
  if (!product) return null;
  const priced = hasPrice(product);
  const compareAt = product.compare_at_price;
  const promo = promoForBrand(promos, product.brand);
  const discount = priced && promo ? discountPercent(String(product.price), compareAt?.toString()) : null;
  const specs = productSpecLine(product);
  const related = (relatedPage?.products ?? []).filter((p) => p.id !== product.id).slice(0, 6);

  return (
    <div className="pb-40">
      <div className="flex items-center gap-2 px-4 py-3">
        <Link
          to="/"
          className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-navy"
          aria-label="Kembali ke beranda"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <nav aria-label="Breadcrumb" className="truncate text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Beranda
          </Link>
          <span> / </span>
          <span className="text-navy">{product.name}</span>
        </nav>
      </div>

      <div className="bg-secondary">
        <div className="mx-auto aspect-square w-full max-w-md overflow-hidden">
          <ProductThumb product={product} textClassName="text-5xl" />
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <Link
            to="/merek/$brand"
            params={{ brand: brandSlug(product.brand) }}
            className="text-xs font-semibold uppercase tracking-wide text-primary"
          >
            {product.brand}
          </Link>
          <div className="flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-xl font-extrabold leading-snug">{product.name}</h1>
            <button
              type="button"
              onClick={() => toggleWishlist(handle)}
              aria-label="Simpan ke wishlist"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary"
            >
              <Heart
                className={`h-5 w-5 ${wishlisted ? "fill-destructive text-destructive" : "text-muted-foreground"}`}
              />
            </button>
          </div>
          {specs && <p className="mt-1 text-sm text-muted-foreground">{specs}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {priced ? (
            <>
              <span className="text-2xl font-extrabold text-navy">{formatIDR(product.price!)}</span>
              {compareAt && discount && (
                <>
                  <span className="text-sm text-muted-foreground line-through">
                    {formatIDR(compareAt)}
                  </span>
                  <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
                    -{discount}%
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-xl font-extrabold text-muted-foreground">Harga menyusul</span>
          )}
        </div>
        {priced && Number(product.price) > 0 && (
          <p className={`text-xs font-bold ${product.stock > 0 ? "text-primary" : "text-destructive"}`}>
            {product.stock > 0 ? "Stok tersedia" : "Stok habis"}
          </p>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-accent-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> 100% Original
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-semibold text-navy">
            <Truck className="h-3.5 w-3.5" /> Kirim seluruh Indonesia
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-secondary p-2.5">
            <dt className="text-muted-foreground">Kategori</dt>
            <dd className="font-semibold text-navy">{product.category}</dd>
          </div>
          <div className="rounded-xl bg-secondary p-2.5">
            <dt className="text-muted-foreground">Subkategori</dt>
            <dd className="font-semibold text-navy">{product.subcategory}</dd>
          </div>
          <div className="rounded-xl bg-secondary p-2.5">
            <dt className="text-muted-foreground">SKU</dt>
            <dd className="font-semibold text-navy">{product.sku}</dd>
          </div>
          {product.bpom_number && (
            <div className="rounded-xl bg-secondary p-2.5">
              <dt className="text-muted-foreground">Nomor BPOM</dt>
              <dd className="font-semibold text-navy">{product.bpom_number}</dd>
            </div>
          )}
        </dl>

        {product.description && (
          <section className="space-y-2">
            <h2 className="text-base font-bold">Deskripsi produk</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </section>
        )}
      </div>

      {related.length > 0 && (
        <ProductRail title={`Produk lain di ${product.subcategory}`} products={related} />
      )}

      <div className="above-bottom-nav fixed inset-x-0 z-40 border-t border-border bg-card px-4 pb-3 pt-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <ProductBuyBar product={product} />
        </div>
      </div>
    </div>
  );
}
