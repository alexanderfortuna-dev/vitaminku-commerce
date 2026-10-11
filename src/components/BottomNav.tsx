import { Link } from "@tanstack/react-router";
import { Bookmark, Grid2x2, Home, ShoppingCart, Sparkles } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";

const ITEMS = [
  { to: "/", label: "Beranda", icon: Home, exact: true },
  { to: "/kategori", label: "Kategori", icon: Grid2x2 },
  { to: "/tujuan", label: "Kebutuhan", icon: Sparkles },
  { to: "/keranjang", label: "Keranjang", icon: ShoppingCart },
  { to: "/akun", label: "Tersimpan", icon: Bookmark },
] as const;

export function BottomNav() {
  const count = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card safe-bottom"
      style={{ boxShadow: "var(--shadow-float)" }}
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ exact: "exact" in item ? item.exact : false }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold"
            >
              <item.icon className="h-5 w-5" />
              {item.label}
              {item.to === "/keranjang" && count > 0 && (
                <span className="absolute right-3 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
