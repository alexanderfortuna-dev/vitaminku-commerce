import { useState } from "react";
import { brandInitials, type DbProduct } from "@/lib/catalog-db";

/**
 * Product image, or a branded VitaminKu placeholder (wordmark + brand + product
 * name) when image_url is missing or fails to load. Text scales with the tile.
 */
export function ProductThumb({
  product,
  className = "",
}: {
  product: DbProduct;
  className?: string;
  /** Kept for existing callers; the placeholder now scales by container size. */
  textClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (product.image_url && !failed) {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        className={`h-full w-full bg-card object-contain ${className}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className={`@container relative h-full w-full overflow-hidden bg-primary-soft ${className}`}
      role="img"
      aria-label={product.name}
    >
      <div className="absolute inset-[6%] flex flex-col rounded-[8cqw] border border-border bg-card p-[7cqw] @max-[120px]:items-center @max-[120px]:justify-center">
        <span className="text-[9cqw] font-extrabold leading-none tracking-tight text-navy @max-[120px]:text-[16cqw]">
          Vitamin<span className="text-primary">Ku</span>
        </span>
        <span className="mt-auto line-clamp-1 text-[7cqw] font-bold uppercase tracking-wide text-muted-foreground @max-[120px]:mt-[6cqw] @max-[120px]:text-[14cqw]">
          <span className="@max-[120px]:hidden">{product.brand || brandInitials(product)}</span>
          <span className="hidden @max-[120px]:inline">{brandInitials(product)}</span>
        </span>
        <span className="mt-[2cqw] line-clamp-3 text-[8.5cqw] font-semibold leading-tight text-navy @max-[120px]:hidden">
          {product.name}
        </span>
      </div>
    </div>
  );
}
