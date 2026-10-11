import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { Logo } from "./Logo";
import { SearchInput } from "./SearchInput";
import { useCartStore } from "@/stores/cartStore";

export function Header() {
  const count = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Link to="/" className="min-w-0" aria-label="VitaminKu, ke beranda">
            <Logo />
          </Link>
          <Link
            to="/keranjang"
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-navy"
            aria-label={`Keranjang, ${count} produk`}
          >
            <ShoppingCart className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </Link>
        </div>
        <div className="mt-3">
          <SearchInput />
        </div>
      </div>
    </header>
  );
}
