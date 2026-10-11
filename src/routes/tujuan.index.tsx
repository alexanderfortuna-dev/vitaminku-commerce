import { Link, createFileRoute } from "@tanstack/react-router";
import { GOALS } from "@/lib/catalog";

export const Route = createFileRoute("/tujuan/")({
  head: () => ({
    meta: [
      { title: "Belanja Sesuai Kebutuhanmu — VitaminKu" },
      {
        name: "description",
        content:
          "Pilih tujuan kesehatanmu: imun, energi, otot, tidur, kulit glowing, atau jantung sehat. VitaminKu bantu pilih produk yang tepat.",
      },
      { property: "og:title", content: "Belanja Sesuai Kebutuhanmu — VitaminKu" },
      {
        property: "og:description",
        content: "Rekomendasi vitamin dan suplemen berdasarkan tujuan kesehatanmu.",
      },
      { property: "og:url", content: "/tujuan" },
    ],
    links: [{ rel: "canonical", href: "/tujuan" }],
  }),
  component: GoalsIndex,
});

function GoalsIndex() {
  return (
    <div className="px-4 py-4 pb-8">
      <h1 className="text-lg font-extrabold">Belanja Sesuai Kebutuhanmu</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nggak yakin harus mulai dari mana? Pilih tujuanmu dulu.
      </p>
      <ul className="mt-4 space-y-3">
        {GOALS.map((goal) => (
          <li key={goal.slug}>
            <Link
              to="/tujuan/$slug"
              params={{ slug: goal.slug }}
              className="flex items-start gap-3 p-4 card-surface"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-accent-foreground">
                <goal.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-navy">{goal.name}</span>
                <span className="block text-xs text-muted-foreground">{goal.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
