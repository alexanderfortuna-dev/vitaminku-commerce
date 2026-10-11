import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { brandSlug } from "@/lib/catalog";
import { brandsQueryOptions } from "@/lib/catalog-db";

export const Route = createFileRoute("/merek/")({
  head: () => ({
    meta: [
      { title: "Semua Merek A–Z — VitaminKu" },
      {
        name: "description",
        content:
          "Direktori merek vitamin, suplemen, dan sports nutrition di VitaminKu, diurutkan A sampai Z.",
      },
      { property: "og:title", content: "Semua Merek A–Z — VitaminKu" },
      { property: "og:description", content: "Jelajahi katalog VitaminKu berdasarkan merek." },
      { property: "og:url", content: "/merek" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/merek" }],
  }),
  component: BrandIndex,
});

function BrandIndex() {
  const { data: brands = [], isPending } = useQuery(brandsQueryOptions());

  const groups = new Map<string, typeof brands>();
  for (const entry of brands) {
    const letter = /[A-Za-z]/.test(entry.brand[0] ?? "") ? entry.brand[0]!.toUpperCase() : "#";
    const list = groups.get(letter) ?? [];
    list.push(entry);
    groups.set(letter, list);
  }
  const letters = Array.from(groups.keys()).sort();

  return (
    <div className="px-4 py-4 pb-8">
      <h1 className="text-lg font-extrabold">Semua Merek</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isPending ? "Memuat merek…" : `${brands.length} merek dalam katalog.`}
      </p>

      {letters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {letters.map((l) => (
            <a
              key={l}
              href={`#merek-${l}`}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-navy"
            >
              {l}
            </a>
          ))}
        </div>
      )}

      {letters.map((letter) => (
        <section key={letter} id={`merek-${letter}`} className="scroll-mt-24 pt-5">
          <h2 className="pb-2 text-base font-extrabold text-primary">{letter}</h2>
          <ul className="space-y-2">
            {groups.get(letter)!.map((entry) => (
              <li key={entry.brand}>
                <Link
                  to="/merek/$brand"
                  params={{ brand: brandSlug(entry.brand) }}
                  className="flex items-center justify-between gap-3 p-3 card-surface"
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-navy">
                    {entry.brand}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {entry.count} produk
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
