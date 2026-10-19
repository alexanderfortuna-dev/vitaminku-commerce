import { createFileRoute } from "@tanstack/react-router";
import panduan from "../../../PANDUAN_OWNER.md?raw";
import { parseMarkdown, type Inline } from "@/lib/simple-markdown";

export const Route = createFileRoute("/admin/panduan")({
  head: () => ({
    meta: [
      { title: "Panduan — Seller Center | VitaminKu" },
      { name: "description", content: "Panduan singkat menjalankan toko VitaminKu tanpa coding." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PanduanPage,
});

const BLOCKS = parseMarkdown(panduan);

function Parts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "bold" ? (
          <strong key={i} className="font-bold text-navy">{p.text}</strong>
        ) : p.kind === "code" ? (
          <code key={i} className="rounded bg-secondary px-1 text-[0.85em]">{p.text}</code>
        ) : p.kind === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function PanduanPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-3 p-4 text-sm leading-relaxed text-foreground">
      {BLOCKS.map((b, i) => {
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind;
          return (
            <List key={i} className={`space-y-1 pl-5 ${b.kind === "ol" ? "list-decimal" : "list-disc"}`}>
              {b.items.map((it, j) => (
                <li key={j}><Parts parts={it} /></li>
              ))}
            </List>
          );
        }
        if (b.kind === "h1") return <h1 key={i} className="text-lg font-extrabold text-navy"><Parts parts={b.parts} /></h1>;
        if (b.kind === "h2") return <h2 key={i} className="pt-3 text-base font-extrabold text-navy"><Parts parts={b.parts} /></h2>;
        return <p key={i} className="text-muted-foreground"><Parts parts={b.parts} /></p>;
      })}
    </article>
  );
}
