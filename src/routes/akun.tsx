import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Heart, HelpCircle, PackageCheck, ShoppingCart } from "lucide-react";
import { ProductGrid } from "@/components/ProductRail";
import { productSlug, productsBySlugsQueryOptions } from "@/lib/catalog-db";
import { useWishlistStore } from "@/stores/wishlistStore";
import { useCartStore } from "@/stores/cartStore";
import { ProductThumb } from "@/components/ProductThumb";
import { formatIDR } from "@/lib/format";
import { toast } from "sonner";
import { AdminPanelLink } from "@/components/AdminPanelLink";

export const Route = createFileRoute("/akun")({
  head: () => ({
    meta: [
      { title: "Tersimpan — Wishlist & Simpan untuk Nanti | VitaminKu" },
      {
        name: "description",
        content:
          "Lihat produk yang kamu simpan di VitaminKu: wishlist dan item yang disimpan untuk nanti, tersimpan di perangkat ini.",
      },
      { property: "og:title", content: "Tersimpan — Wishlist & Simpan untuk Nanti | VitaminKu" },
      {
        property: "og:description",
        content: "Wishlist dan item simpanan kamu di VitaminKu, siap dipindahkan ke keranjang.",
      },
      { property: "og:url", content: "/akun" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/akun" }],
  }),
  component: SavedPage,
});

function SavedPage() {
  const handles = useWishlistStore((s) => s.handles);
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const savedItems = useCartStore((s) => s.savedItems);
  const moveToCart = useCartStore((s) => s.moveToCart);
  const {
    data: wishlist = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    ...productsBySlugsQueryOptions(handles),
    enabled: handles.length > 0,
  });
  const foundHandles = wishlist.map((p) => productSlug(p));
  const missingHandles = handles.filter((h) => !foundHandles.includes(h));

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pb-8">
      <div className="brand-gradient px-4 py-6 text-navy-foreground">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-card/20">
            <Bookmark className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold">Tersimpan</p>
            <p className="text-xs opacity-90">
              Wishlist & item simpanan kamu, tersimpan di perangkat ini. Belanja tetap bisa tanpa
              akun.
            </p>
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 px-4 py-4">
        <li>
          <button
            type="button"
            onClick={() => scrollToSection("wishlist")}
            className="flex w-full items-center gap-2 p-3 text-left card-surface"
          >
            <Heart className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm font-semibold text-navy">Wishlist</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => scrollToSection("simpanan")}
            className="flex w-full items-center gap-2 p-3 text-left card-surface"
          >
            <Bookmark className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm font-semibold text-navy">
              Simpan untuk Nanti
            </span>
          </button>
        </li>
        <li>
          <Link to="/keranjang" className="flex items-center gap-2 p-3 card-surface">
            <ShoppingCart className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm font-semibold text-navy">Keranjang</span>
          </Link>
        </li>
        <li>
          <Link to="/bantuan" className="flex items-center gap-2 p-3 card-surface">
            <HelpCircle className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm font-semibold text-navy">
              Bantuan Pesanan
            </span>
          </Link>
        </li>
      </ul>

      <AdminPanelLink />

      <p className="px-4 text-xs text-muted-foreground">
        Beta: login pelanggan, riwayat pesanan, dan lacak pengiriman belum tersedia di aplikasi ini.
        Detail pesanan dikirim lewat email konfirmasi dari halaman pembayaran.
      </p>

      <section id="simpanan" className="scroll-mt-24 py-4">
        <h2 className="px-4 pb-3 text-base font-extrabold">Simpan untuk Nanti</h2>
        {savedItems.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">
            Belum ada item simpanan. Tekan &quot;Simpan&quot; pada produk di keranjang untuk
            memindahkannya ke sini.
          </p>
        ) : (
          <ul className="space-y-2 px-4">
            {savedItems.map((item) => (
              <li key={item.slug} className="flex items-center gap-3 p-3 card-surface">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-secondary">
                  <ProductThumb product={item.product} textClassName="text-xs" />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-navy">
                    {item.product.name}
                  </span>
                  <span className="block text-xs text-primary">{formatIDR(Number(item.product.price ?? 0))}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      moveToCart(item.slug);
                      toast.success("Ditambahkan ke keranjang", { description: item.product.name });
                    } catch (error) {
                      toast.error(
                        `Gagal menambahkan ke keranjang: ${error instanceof Error ? error.message : "coba lagi"}`,
                      );
                    }
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                >
                  <PackageCheck className="h-3.5 w-3.5" /> Ke Keranjang
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="wishlist" className="scroll-mt-24 py-4">
        <h2 className="px-4 pb-3 text-base font-extrabold">Wishlist Saya</h2>
        {handles.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">
            Belum ada produk favorit. Tekan ikon hati pada produk untuk menyimpannya.
          </p>
        ) : isError ? (
          <div className="px-4">
            <p className="text-sm text-muted-foreground">
              Produk wishlist sedang tidak dapat dimuat. Coba lagi beberapa saat.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Coba lagi
            </button>
          </div>
        ) : isPending ? (
          <ProductGrid products={[]} isLoading />
        ) : (
          <>
            <ProductGrid products={wishlist} />
            {missingHandles.length > 0 && (
              <ul className="mt-3 space-y-2 px-4">
                {missingHandles.map((handle) => (
                  <li
                    key={handle}
                    className="flex items-center justify-between gap-3 p-3 card-surface"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-navy">
                        {handle.replace(/-/g, " ")}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Produk tidak tersedia lagi
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleWishlist(handle)}
                      className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-navy"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
