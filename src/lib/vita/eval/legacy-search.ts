// Emulasi pencarian Vita Rilis 2 (src/lib/vitamin-finder.server.ts queryProducts) di atas salinan katalog.
// Dipakai hanya untuk mengukur titik awal (baseline) di eval.
import { cleanQuery, type SearchArgs, type SearchFn } from "../../../../supabase/functions/_shared/vitamin-finder-core";
import type { SnapRow } from "./harness";

export function legacySearch(rows: SnapRow[]): SearchFn {
  const hay = (r: SnapRow) => [r.name, r.brand, r.category ?? "", r.subcategory ?? ""].map((s) => s.toLowerCase());
  const run = (terms: string[], a: SearchArgs) => {
    const cat = a.category ? cleanQuery(a.category).toLowerCase() : "";
    const hits = rows.filter((r) => {
      if (a.max_price !== undefined && r.price > a.max_price) return false;
      const h = hay(r);
      if (!terms.every((t) => h.some((x) => x.includes(t.toLowerCase())))) return false;
      if (cat && ![r.category ?? "", r.subcategory ?? ""].some((x) => x.toLowerCase().includes(cat))) return false;
      return true;
    });
    // PostgREST: order by price, lalu urutan fisik (di sini: id) — limit 8.
    hits.sort((x, y) => (a.max_price === undefined ? x.price - y.price : y.price - x.price) || x.id.localeCompare(y.id));
    return hits.slice(0, 8).map((r) => ({ id: r.id, name: r.name, brand: r.brand, price: r.price, size: r.size, image_url: null, slug: r.slug }));
  };
  return async (a) => {
    const words = cleanQuery(a.query).split(" ").filter(Boolean);
    const terms = words.some((w) => w.length === 1) ? [words.join(" ")] : words.filter((t) => t.length > 1).slice(0, 3);
    const out = run(terms, a);
    if (out.length === 0 && terms.length > 1) return run(terms.slice(0, 1), a);
    return out;
  };
}
