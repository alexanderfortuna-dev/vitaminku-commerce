import { toast } from "sonner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { MAX_LINE_QUANTITY, useCartStore } from "@/stores/cartStore";
import { ProductThumb } from "@/components/ProductThumb";

export const Route = createFileRoute("/keranjang")({
  head: () => ({
    meta: [
      { title: "Keranjang Belanja — VitaminKu" },
      {
        name: "description",
        content: "Periksa keranjang belanja VitaminKu lalu lanjut ke halaman pembayaran yang aman.",
      },
      { property: "og:title", content: "Keranjang Belanja — VitaminKu" },
      {
        property: "og:description",
        content: "Checkout cepat tanpa harus membuat akun.",
      },
      { property: "og:url", content: "/keranjang" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/keranjang" }],
  }),
  component: CartPage,
});

function CartPage() {
  const items = useCartStore((s) => s.items);
  const savedItems = useCartStore((s) => s.savedItems);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const saveForLater = useCartStore((s) => s.saveForLater);
  const moveToCart = useCartStore((s) => s.moveToCart);

  const subtotal = items.reduce((sum, i) => sum + Number(i.product.price) * i.quantity, 0);

  return (
    <div className="pb-40">
      <div className="px-4 py-4">
        <h1 className="text-lg font-extrabold">Keranjang</h1>
        <p className="text-sm text-muted-foreground">{items.length} produk siap dibayar</p>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-3 text-base font-bold">Keranjangmu masih kosong</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Yuk mulai belanja vitamin dan suplemen favoritmu.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Mulai Belanja
          </Link>
        </div>
      ) : (
        <ul className="space-y-3 px-4">
          {items.map((item) => (
            <li key={item.slug} className="flex gap-3 p-3 card-surface">
              <Link
                to="/produk/$handle"
                params={{ handle: item.slug }}
                className="shrink-0"
              >
                <div className="h-20 w-20 overflow-hidden rounded-lg bg-secondary">
                  <ProductThumb product={item.product} textClassName="text-base" />
                </div>
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to="/produk/$handle"
                  params={{ handle: item.slug }}
                  className="line-clamp-2 text-sm font-semibold text-navy"
                >
                  {item.product.name}
                </Link>
                <p className="mt-1 text-sm font-bold text-navy">
                  {formatIDR(Number(item.product.price) * item.quantity)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full border border-border px-2 py-1">
                    <button
                      type="button"
                      aria-label="Kurangi jumlah"
                                            onClick={() =>
                        updateQuantity(item.slug, item.quantity - 1)
                      }
                      className="grid h-6 w-6 place-items-center rounded-full bg-secondary"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="min-w-5 text-center text-xs font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label="Tambah jumlah"
                      disabled={item.quantity >= Math.min(MAX_LINE_QUANTITY, item.product.stock)}
                      onClick={() =>
                        updateQuantity(item.slug, item.quantity + 1)
                      }
                      className="grid h-6 w-6 place-items-center rounded-full bg-secondary"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      saveForLater(item.slug)
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
                  >
                    <Bookmark className="h-3.5 w-3.5" /> Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      removeItem(item.slug)
                    }
                    aria-label="Hapus produk"
                    className="ml-auto text-muted-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {savedItems.length > 0 && (
        <section className="mt-6 px-4">
          <h2 className="mb-2 text-base font-bold">Disimpan untuk nanti</h2>
          <ul className="space-y-2">
            {savedItems.map((item) => (
              <li key={item.slug} className="flex items-center gap-3 p-3 card-surface">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-secondary">
                  <ProductThumb product={item.product} textClassName="text-xs" />
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {item.product.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      moveToCart(item.slug);
                    } catch (error) {
                      toast.error(
                        `Gagal menambahkan ke keranjang: ${error instanceof Error ? error.message : "coba lagi"}`,
                      );
                    }
                  }}
                  className="shrink-0 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-accent-foreground"
                >
                  Pindah
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length > 0 && (
        <div className="above-bottom-nav fixed inset-x-0 z-40 border-t border-border bg-card px-4 pb-3 pt-3">
          <div className="mx-auto max-w-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-base font-extrabold text-navy">{formatIDR(subtotal)}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Ongkir dihitung di langkah pengiriman. Bisa checkout tanpa akun.
            </p>
            <Link
              to="/checkout"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
            >
              Checkout
            </Link>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Alamat → Pengiriman → Pembayaran (QRIS, e-wallet, VA).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
