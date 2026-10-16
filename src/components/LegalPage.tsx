import { LEGAL_DRAFT_NOTICE, type LegalDoc } from "@/lib/legal-content";

/** Halaman hukum: judul, banner Draf, dan bagian-bagian teks. Teks ada di lib/legal-content.ts. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <article className="space-y-5 px-4 py-6">
      <h1 className="text-2xl font-extrabold text-navy">{doc.title}</h1>
      <p role="note" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
        {LEGAL_DRAFT_NOTICE}. Bagian bertanda [ISI: …] belum diisi.
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading} className="space-y-2">
          <h2 className="text-base font-bold text-navy">{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="text-sm leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
