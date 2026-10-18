import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { discountPercent, formatIDR } from "@/lib/format";
import { hasPrice, productSlug, type DbProduct } from "@/lib/catalog-db";
import { ProductThumb } from "@/components/ProductThumb";
import { useWishlistStore } from "@/stores/wishlistStore";
import { AddToCartButton } from "@/components/AddToCartButton";
import { useRunningPromos } from "@/hooks/useRunningPromos";
import { promoEndLabel, promoForBrand } from "@/lib/promo";

export function ProductCard({ product }: { product: DbProduct }) {
  const slug = productSlug(product);
  const priced = hasPrice(product);
  const compareAt = product.compare_at_price;
  // Strike-through and badge only while a real promo for this brand is running.
  const promo = promoForBrand(useRunningPromos(), product.brand);
  const discount = priced && promo ? discountPercent(String(product.price), compareAt?.toString()) : null;
  const wishlisted = useWishlistStore((s) => s.handles.includes(slug));
  const toggleWishlist = useWishlistStore((s) => s.toggle);

  return (
    <article className="group relative flex flex-col overflow-hidden card-surface">
      <Link
        to="/produk/$handle"
        params={{ handle: slug }}
        className="block"
        aria-label={product.name}
      >
        <div className="relative aspect-square overflow-hidden bg-secondary">
          <ProductThumb product={product} textClassName="text-2xl" />
          {discount && (
            <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold text-destructive-foreground">
              -{discount}%
            </span>
          )}
        </div>
      </Link>

      <button
        type="button"
        aria-label={wishlisted ? "Hapus dari wishlist" : "Simpan ke wishlist"}
        onClick={() => toggleWishlist(slug)}
        className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-muted-foreground"
      >
        <Heart className={`h-8 w-8 rounded-full bg-card/90 p-2 shadow-sm ${wishlisted ? "fill-destructive text-destructive" : ""}`} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {product.brand}
        </p>
        <Link
          to="/produk/$handle"
          params={{ handle: slug }}
          className="line-clamp-2 text-sm font-semibold leading-snug text-navy"
        >
          {product.name}
        </Link>
        <div className="mt-auto pt-2">
          {priced ? (
            <>
              <p className="text-sm font-bold text-navy">{formatIDR(product.price!)}</p>
              {compareAt && discount && (
                <p className="text-xs text-muted-foreground line-through">{formatIDR(compareAt)}</p>
              )}
              {promo && (
                <p className="mt-1 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                  Kode {promo.code} · Promo s/d {promoEndLabel(promo)}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm font-bold text-muted-foreground">Harga menyusul</p>
          )}
        </div>

        <AddToCartButton product={product} className="mt-2" />
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden card-surface">
      <div className="aspect-square animate-pulse bg-secondary" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-full animate-pulse rounded bg-secondary" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-secondary" />
        <div className="h-8 w-full animate-pulse rounded-full bg-secondary" />
      </div>
    </div>
  );
}
