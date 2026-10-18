import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { hasPrice, isBuyable, type DbProduct } from "@/lib/catalog-db";
import { useCartStore } from "@/stores/cartStore";
import { priceInquiryUrl } from "@/lib/official-contacts";

const noPrice = (p: DbProduct) => !(hasPrice(p) && Number(p.price) > 0);

function add(product: DbProduct): boolean {
  try {
    useCartStore.getState().addItem(product, 1);
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Gagal menambahkan ke keranjang");
    return false;
  }
}

/** Card-size button: "+ Keranjang", or the reason it can't be bought. */
export function AddToCartButton({ product, className = "" }: { product: DbProduct; className?: string }) {
  if (!isBuyable(product)) {
    if (noPrice(product)) {
      return (
        <a
          href={priceInquiryUrl(product.name)}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center justify-center rounded-full border border-primary px-3 py-2 text-xs font-bold text-primary ${className}`}
        >
          Tanya harga via WA
        </a>
      );
    }
    return (
      <span
        className={`inline-flex items-center justify-center min-h-11 rounded-full bg-secondary px-3 py-2 text-xs font-bold text-muted-foreground ${className}`}
      >
        {hasPrice(product) && Number(product.price) > 0 ? "Stok habis" : "Harga menyusul"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => add(product) && toast.success("Ditambahkan ke keranjang", { description: product.name })}
      className={`inline-flex items-center justify-center min-h-11 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground ${className}`}
    >
      + Keranjang
    </button>
  );
}

/** Sticky product-page actions: "+ Keranjang" and "Beli Sekarang". */
export function ProductBuyBar({ product }: { product: DbProduct }) {
  const navigate = useNavigate();
  if (!isBuyable(product)) {
    if (noPrice(product)) {
      return (
        <a
          href={priceInquiryUrl(product.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="grid min-h-11 flex-1 place-items-center rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          Tanya harga via WA
        </a>
      );
    }
    return (
      <button
        type="button"
        disabled
        className="min-h-11 flex-1 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {hasPrice(product) && Number(product.price) > 0 ? "Stok habis" : "Harga menyusul"}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => add(product) && toast.success("Ditambahkan ke keranjang", { description: product.name })}
        className="min-h-11 flex-1 rounded-full border border-primary px-4 py-3 text-sm font-bold text-primary"
      >
        + Keranjang
      </button>
      <button
        type="button"
        onClick={() => {
          const inCart = useCartStore.getState().items.some((i) => i.slug === (product.slug ?? product.id));
          if (inCart || add(product)) void navigate({ to: "/checkout" });
        }}
        className="min-h-11 flex-1 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
      >
        Beli Sekarang
      </button>
    </>
  );
}
