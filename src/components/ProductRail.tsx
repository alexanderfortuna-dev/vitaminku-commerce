import type { DbProduct } from "@/lib/catalog-db";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";

export function ProductRail({
  title,
  products,
  isLoading = false,
  action,
}: {
  title: string;
  products: DbProduct[];
  isLoading?: boolean;
  action?: React.ReactNode;
}) {
  if (!isLoading && products.length === 0) return null;
  return (
    <section className="py-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <h2 className="min-w-0 truncate text-base font-extrabold">{title}</h2>
        {action}
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
        {(isLoading ? Array.from({ length: 4 }) : products).map((item, i) => (
          <div key={i} className="w-40 shrink-0">
            {isLoading ? <ProductCardSkeleton /> : <ProductCard product={item as DbProduct} />}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductGrid({
  products,
  isLoading = false,
}: {
  products: DbProduct[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
