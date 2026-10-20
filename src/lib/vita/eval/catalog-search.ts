// Emulasi pencarian katalog Vita (sama dengan server: subkategori ATAU kata kunci di nama/merek, harga ≤ budget, maks 300, urut id).
import type { CatalogQuery, CatalogSearch } from "../engine";
import type { CatalogRow } from "../rank";
import type { SnapRow } from "./harness";

export function toCatalogRow(r: SnapRow): CatalogRow {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    category: r.category,
    subcategory: r.subcategory,
    size: r.size,
    servings: r.servings,
    dose: r.dose,
    flavor: r.flavor,
    price: r.price,
    in_stock: r.in_stock,
    image: r.has_image ? `https://contoh.invalid/${r.slug}.webp` : null,
    slug: r.slug,
    pack_count: r.pack_count,
    variant_group: null,
  };
}

export function snapshotSearch(rows: SnapRow[]): CatalogSearch {
  const all = rows.map(toCatalogRow).sort((a, b) => a.id.localeCompare(b.id));
  return async (q: CatalogQuery) => {
    const kws = q.keywords.map((k) => k.toLowerCase());
    return all
      .filter((r) => (q.maxPrice === null || r.price <= q.maxPrice) && (q.subcategories.includes(r.subcategory ?? "") || kws.some((k) => r.name.toLowerCase().includes(k) || r.brand.toLowerCase().includes(k))))
      .slice(0, q.limit);
  };
}
