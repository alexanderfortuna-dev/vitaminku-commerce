// SEO murni: JSON-LD Product dan pembentuk sitemap.xml. Tidak membaca database; datanya dioper pemanggil.
import { CATEGORIES } from "./catalog";

export interface JsonLdProductInput {
  name: string;
  slug: string | null;
  sku: string;
  brand: string;
  description: string | null;
  image_url: string | null;
  price: number | string | null;
  stock: number;
}

/** Origin situs tanpa garis miring akhir, mis. "https://contoh.id"; "" bila belum diketahui. */
export function cleanOrigin(raw: string | undefined | null): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/i.test(v) ? v : "";
}

/**
 * JSON-LD schema.org/Product. Hanya untuk produk yang punya harga > 0 (yang "Harga menyusul" tidak dapat dibeli,
 * jadi tidak diberi penawaran). Ketersediaan mengikuti stok. Tidak ada rating/ulasan.
 */
export function buildProductJsonLd(p: JsonLdProductInput, origin = ""): Record<string, unknown> | null {
  const price = p.price === null || p.price === "" ? NaN : Number(p.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!p.name.trim()) return null;
  const base = cleanOrigin(origin);
  const url = base && p.slug ? `${base}/produk/${encodeURIComponent(p.slug)}` : undefined;
  const description = (p.description ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name.trim(),
    ...(p.image_url ? { image: [p.image_url] } : {}),
    ...(description ? { description } : {}),
    sku: p.sku,
    ...(p.brand.trim() ? { brand: { "@type": "Brand", name: p.brand.trim() } } : {}),
    offers: {
      "@type": "Offer",
      ...(url ? { url } : {}),
      priceCurrency: "IDR",
      price: String(Math.round(price)),
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

/** Aman disisipkan di <script type="application/ld+json">: karakter < dan pemisah baris unicode di-escape. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

// ---------------- sitemap ----------------

export interface SitemapProduct {
  slug: string | null;
  price: number | string | null;
  is_active: boolean;
  is_blocked: boolean;
  updated_at?: string | null;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

export const SITEMAP_MAX_URLS = 50_000;

/** Halaman publik tetap (tanpa kategori/merek/produk). */
export const STATIC_PATHS = ["/", "/kategori", "/merek", "/tujuan", "/bantuan", "/syarat", "/privasi", "/pengembalian"] as const;

/** Produk yang boleh masuk sitemap: aktif, tidak diblokir, harga > 0, punya slug. */
export function isSitemapProduct(p: SitemapProduct): boolean {
  const price = p.price === null || p.price === "" ? NaN : Number(p.price);
  return p.is_active === true && p.is_blocked === false && Number.isFinite(price) && price > 0 && !!p.slug?.trim();
}

function isoDate(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/** @param brands nama merek yang punya produk aktif (dedup & urut dilakukan di sini). */
export function buildSitemapEntries(input: { origin: string; products: SitemapProduct[]; brands: string[] }): SitemapEntry[] {
  const origin = cleanOrigin(input.origin);
  if (!origin) return [];
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  const add = (path: string, lastmod?: string) => {
    const loc = `${origin}${path}`;
    if (seen.has(loc)) return;
    seen.add(loc);
    out.push(lastmod ? { loc, lastmod } : { loc });
  };
  for (const p of STATIC_PATHS) add(p);
  for (const c of CATEGORIES) add(`/kategori/${c.slug}`);
  for (const b of [...new Set(input.brands.map((x) => x.trim()).filter(Boolean))].sort((a, z) => a.localeCompare(z, "id"))) {
    add(`/merek/${encodeURIComponent(b)}`);
  }
  for (const p of input.products) {
    if (isSitemapProduct(p)) add(`/produk/${encodeURIComponent(p.slug!.trim())}`, isoDate(p.updated_at));
  }
  return out.slice(0, SITEMAP_MAX_URLS);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => `  <url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ---------------- robots ----------------

/** Halaman pribadi/staf yang tidak boleh dirayapi mesin pencari (tetap dilindungi login di server). */
export const ROBOTS_PRIVATE_PATHS = ["/admin", "/seller", "/akun", "/checkout", "/pesanan/", "/masuk", "/api/"];

/** Isi robots.txt: katalog boleh diindeks, halaman pribadi/staf tidak; baris Sitemap bila origin diketahui. */
export function buildRobotsTxt(origin: string): string {
  const agents = ["Googlebot", "Bingbot", "Twitterbot", "facebookexternalhit", "*"];
  const disallow = ROBOTS_PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join("\n");
  const rules = agents.map((a) => `User-agent: ${a}\n${disallow}\nAllow: /`).join("\n\n");
  const base = cleanOrigin(origin);
  return `${rules}\n${base ? `\nSitemap: ${base}/sitemap.xml\n` : ""}`;
}
