import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, PackageSearch, ShieldCheck, Truck, Wallet } from "lucide-react";
import { ProductRail } from "@/components/ProductRail";
import { CATEGORIES, GOALS, brandSlug } from "@/lib/catalog";
import { brandsQueryOptions, productsQueryOptions } from "@/lib/catalog-db";
import { useServerFn } from "@tanstack/react-start";
import { getPublicStore } from "@/lib/store.functions";

const TRUST = [
  { icon: ShieldCheck, title: "100% Original", desc: "Produk asli & tersegel" },
  { icon: Wallet, title: "Pesan Mudah", desc: "Konfirmasi via WhatsApp" },
  { icon: Truck, title: "Limitless Group", desc: "9+ cabang di Bali" },
  { icon: MapPin, title: "Dikirim dari Bali", desc: "Diproses cabang terdekat" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VitaminKu — E-commerce Vitamin Terlengkap Indonesia" },
      {
        name: "description",
        content:
          "Belanja vitamin, suplemen, dan sports nutrition di VitaminKu. Katalog lengkap ribuan produk, pilih sesuai kebutuhanmu.",
      },
      {
        property: "og:title",
        content: "VitaminKu — E-commerce Vitamin Terlengkap Indonesia",
      },
      {
        property: "og:description",
        content: "Katalog vitamin, suplemen, dan sports nutrition terlengkap di Indonesia.",
      },
      { property: "og:url", content: "/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Store",
          name: "VitaminKu",
          description: "E-commerce vitamin dan suplemen terlengkap di Indonesia.",
          areaServed: "ID",
          currenciesAccepted: "IDR",
        }),
      },
    ],
  }),
  component: Home,
});

function Home() {
  const {
    data: newestPage,
    isPending,
    isError,
    refetch,
  } = useQuery(productsQueryOptions({ sort: "newest", limit: 10, purchasableOnly: true }));
  const { data: browsePage } = useQuery(productsQueryOptions({ sort: "name", limit: 10, purchasableOnly: true }));
  const { data: heroPage } = useQuery(productsQueryOptions({ heroOnly: true, purchasableOnly: true, limit: 10 }));
  const { data: brands = [] } = useQuery(brandsQueryOptions());
  const fetchStore = useServerFn(getPublicStore);
  const { data: store } = useQuery({ queryKey: ["public-store"], queryFn: () => fetchStore(), staleTime: 60_000 });
  const st = store?.settings;

  const newest = newestPage?.products ?? [];
  const browse = browsePage?.products ?? [];
  const hasCatalog = isPending || newest.length > 0;

  return (
    <div>
      <section className="soft-gradient px-4 pb-5 pt-5">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          E-commerce Vitamin Terlengkap Indonesia
        </p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight">
          {st?.hero_title || "Sehat itu gampang, mulai dari yang kamu butuhkan"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {st?.hero_subtitle || "Vitamin, suplemen, sports nutrition, dan aksesoris olahraga dalam satu katalog."}
        </p>
        {(st?.free_shipping_note || st?.operating_hours) && (
          <p className="mt-2 text-xs font-semibold text-navy">
            {[st?.free_shipping_note, st?.operating_hours].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Link
            to="/tujuan"
            className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            Belanja Sesuai Kebutuhan <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/kategori"
            className="inline-flex items-center rounded-full border border-border bg-card px-4 py-3 text-sm font-bold text-navy"
          >
            Semua Kategori
          </Link>
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-2">
          {TRUST.map((t) => (
            <li key={t.title} className="flex items-center gap-2 rounded-xl bg-card p-2.5">
              <t.icon className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-navy">{t.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{t.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="py-5">
        <div className="mb-3 flex items-center justify-between gap-3 px-4">
          <h2 className="text-base font-extrabold">Belanja Sesuai Kebutuhanmu</h2>
          <Link to="/tujuan" className="shrink-0 text-xs font-bold text-primary">
            Lihat semua
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
          {GOALS.map((goal) => (
            <Link
              key={goal.slug}
              to="/tujuan/$slug"
              params={{ slug: goal.slug }}
              className="flex w-32 shrink-0 flex-col gap-2 p-3 card-surface"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-accent-foreground">
                <goal.icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-bold text-navy">{goal.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="pb-2">
        <div className="mb-3 flex items-center justify-between gap-3 px-4">
          <h2 className="text-base font-extrabold">Kategori</h2>
          <Link to="/kategori" className="shrink-0 text-xs font-bold text-primary">
            Lihat semua
          </Link>
        </div>
        <ul className="grid grid-cols-3 gap-2 px-4">
          {CATEGORIES.map((cat) => (
            <li key={cat.slug}>
              <Link
                to="/kategori/$slug"
                params={{ slug: cat.slug }}
                className="flex h-full flex-col items-center gap-1.5 rounded-xl p-2 text-center hover:bg-secondary"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-primary">
                  <cat.icon className="h-5 w-5" />
                </span>
                <span className="text-[11px] font-semibold leading-tight text-navy">
                  {cat.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {brands.length > 0 && (
        <section className="py-5">
          <div className="mb-3 flex items-center justify-between gap-3 px-4">
            <h2 className="text-base font-extrabold">Merek</h2>
            <Link to="/merek" className="shrink-0 text-xs font-bold text-primary">
              Semua merek
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
            {brands.slice(0, 16).map((b) => (
              <Link
                key={b.brand}
                to="/merek/$brand"
                params={{ brand: brandSlug(b.brand) }}
                className="shrink-0 rounded-full bg-secondary px-3 py-2 text-xs font-semibold text-navy"
              >
                {b.brand}
              </Link>
            ))}
          </div>
        </section>
      )}

      {isError ? (
        <section className="px-4 py-8 text-center">
          <PackageSearch className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-bold">Produk sedang tidak dapat dimuat</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Koneksi ke katalog terganggu. Coba lagi beberapa saat.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Coba lagi
          </button>
        </section>
      ) : hasCatalog ? (
        <>
          <ProductRail title="Promo Pilihan" products={heroPage?.products ?? []} />
          <ProductRail title="Produk Terbaru" products={newest} isLoading={isPending} />
          <ProductRail title="Jelajahi Katalog" products={browse} />
        </>
      ) : (
        <section className="px-4 py-8 text-center">
          <PackageSearch className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-bold">Katalog sedang disiapkan</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Produk akan muncul otomatis di sini begitu tersedia.
          </p>
        </section>
      )}
    </div>
  );
}
