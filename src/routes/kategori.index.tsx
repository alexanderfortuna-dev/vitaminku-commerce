import { Link, createFileRoute } from "@tanstack/react-router";
import { CATEGORIES } from "@/lib/catalog";

export const Route = createFileRoute("/kategori/")({
  head: () => ({
    meta: [
      { title: "Semua Kategori Vitamin & Suplemen — VitaminKu" },
      {
        name: "description",
        content:
          "Jelajahi kategori lengkap VitaminKu: vitamin harian, imunitas, sports nutrition, herbal, ibu & anak, hingga kecantikan dari dalam.",
      },
      { property: "og:title", content: "Semua Kategori — VitaminKu" },
      {
        property: "og:description",
        content: "Katalog vitamin dan suplemen original terlengkap di Indonesia.",
      },
      { property: "og:url", content: "/kategori" },
    ],
    links: [{ rel: "canonical", href: "/kategori" }],
  }),
  component: CategoryIndex,
});

function CategoryIndex() {
  return (
    <div className="px-4 py-4 pb-8">
      <h1 className="text-lg font-extrabold">Semua Kategori</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pilih kategori untuk menemukan produk yang kamu butuhkan.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => (
          <li key={cat.slug}>
            <Link
              to="/kategori/$slug"
              params={{ slug: cat.slug }}
              className="flex h-full flex-col gap-2 p-3 card-surface"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-accent-foreground">
                <cat.icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold text-navy">{cat.name}</span>
              <span className="text-xs text-muted-foreground">{cat.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
