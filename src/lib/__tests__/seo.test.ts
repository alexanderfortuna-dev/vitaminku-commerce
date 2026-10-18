import { describe, expect, it } from "vitest";
import {
  STATIC_PATHS,
  buildProductJsonLd,
  buildRobotsTxt,
  buildSitemapEntries,
  buildSitemapXml,
  cleanOrigin,
  isSitemapProduct,
  serializeJsonLd,
  type SitemapProduct,
} from "../seo";

const base = {
  name: "Vitamin C 1000",
  slug: "vitamin-c-1000",
  sku: "VC-1",
  brand: "Merek X",
  description: "Vitamin C   harian\nisi 60",
  image_url: "https://img.example.com/vc.jpg",
  price: 125000,
  stock: 5,
};

describe("JSON-LD Product", () => {
  it("memuat nama, gambar, merek, dan penawaran IDR dengan ketersediaan sesuai stok", () => {
    const ld = buildProductJsonLd(base, "https://toko.example.com/")!;
    expect(ld["@type"]).toBe("Product");
    expect(ld["name"]).toBe("Vitamin C 1000");
    expect(ld["image"]).toEqual(["https://img.example.com/vc.jpg"]);
    expect(ld["brand"]).toEqual({ "@type": "Brand", name: "Merek X" });
    expect(ld["description"]).toBe("Vitamin C harian isi 60");
    expect(ld["offers"]).toEqual({
      "@type": "Offer",
      url: "https://toko.example.com/produk/vitamin-c-1000",
      priceCurrency: "IDR",
      price: "125000",
      availability: "https://schema.org/InStock",
    });
  });

  it("stok 0 → OutOfStock; harga string numerik dibulatkan", () => {
    const ld = buildProductJsonLd({ ...base, stock: 0, price: "99000.00" })!;
    expect((ld["offers"] as Record<string, unknown>)["availability"]).toBe("https://schema.org/OutOfStock");
    expect((ld["offers"] as Record<string, unknown>)["price"]).toBe("99000");
  });

  it("tanpa harga / harga 0 → tidak ada JSON-LD (Harga menyusul)", () => {
    expect(buildProductJsonLd({ ...base, price: null })).toBeNull();
    expect(buildProductJsonLd({ ...base, price: 0 })).toBeNull();
    expect(buildProductJsonLd({ ...base, price: "abc" })).toBeNull();
  });

  it("tanpa origin: tidak ada url penawaran; tanpa foto: tidak ada image; tidak pernah ada rating/ulasan", () => {
    const ld = buildProductJsonLd({ ...base, image_url: null })!;
    expect("image" in ld).toBe(false);
    expect("url" in (ld["offers"] as object)).toBe(false);
    const text = JSON.stringify(ld);
    expect(text).not.toMatch(/aggregateRating|review|ratingValue/i);
  });

  it("serializeJsonLd meng-escape < agar tidak bisa menutup tag script", () => {
    const out = serializeJsonLd({ name: "</script><b>x" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ name: "</script><b>x" });
  });
});

describe("sitemap", () => {
  const p = (over: Partial<SitemapProduct> = {}): SitemapProduct => ({
    slug: "a", price: 1000, is_active: true, is_blocked: false, updated_at: "2026-10-01T10:00:00Z", ...over,
  });

  it("hanya produk aktif, tidak diblokir, harga > 0, ber-slug", () => {
    expect(isSitemapProduct(p())).toBe(true);
    expect(isSitemapProduct(p({ is_active: false }))).toBe(false);
    expect(isSitemapProduct(p({ is_blocked: true }))).toBe(false);
    expect(isSitemapProduct(p({ price: null }))).toBe(false);
    expect(isSitemapProduct(p({ price: 0 }))).toBe(false);
    expect(isSitemapProduct(p({ slug: null }))).toBe(false);
  });

  it("memuat halaman utama, 3 halaman hukum, kategori, merek, dan produk layak", () => {
    const e = buildSitemapEntries({
      origin: "https://toko.example.com/",
      brands: ["Merek B", "Merek A", "Merek A"],
      products: [p({ slug: "ok" }), p({ slug: "blok", is_blocked: true }), p({ slug: "gratis", price: 0 }), p({ slug: "nonaktif", is_active: false })],
    });
    const locs = e.map((x) => x.loc);
    for (const path of STATIC_PATHS) expect(locs).toContain(`https://toko.example.com${path === "/" ? "/" : path}`);
    expect(locs).toContain("https://toko.example.com/syarat");
    expect(locs).toContain("https://toko.example.com/privasi");
    expect(locs).toContain("https://toko.example.com/pengembalian");
    expect(locs).toContain("https://toko.example.com/kategori/vitamin-suplemen");
    expect(locs.filter((l) => l.includes("/merek/"))).toEqual([
      "https://toko.example.com/merek/Merek%20A",
      "https://toko.example.com/merek/Merek%20B",
    ]);
    expect(locs).toContain("https://toko.example.com/produk/ok");
    expect(locs.some((l) => /blok|gratis|nonaktif/.test(l))).toBe(false);
    expect(e.find((x) => x.loc.endsWith("/produk/ok"))?.lastmod).toBe("2026-10-01");
    expect(new Set(locs).size).toBe(locs.length);
  });

  it("origin tidak valid → kosong", () => {
    expect(buildSitemapEntries({ origin: "", products: [p()], brands: [] })).toEqual([]);
    expect(cleanOrigin("javascript:alert(1)")).toBe("");
    expect(cleanOrigin("https://a.id///")).toBe("https://a.id");
  });

  it("XML meng-escape karakter khusus", () => {
    const xml = buildSitemapXml([{ loc: "https://a.id/merek/A&B<c>", lastmod: "2026-10-01" }]);
    expect(xml).toContain("<loc>https://a.id/merek/A&amp;B&lt;c&gt;</loc>");
    expect(xml).toContain("<lastmod>2026-10-01</lastmod>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

describe("robots.txt", () => {
  it("tetap boleh diindeks dan memuat baris Sitemap bila origin diketahui", () => {
    const t = buildRobotsTxt("https://toko.example.com");
    expect(t).toContain("User-agent: *\nDisallow: /admin");
    expect(t).toContain("Disallow: /seller");
    expect(t).toContain("Disallow: /pesanan/");
    expect(t).toMatch(/Allow: \/$/m);
    expect(t).toContain("Sitemap: https://toko.example.com/sitemap.xml");
    expect(t).not.toMatch(/Disallow:\s*\/\s*$/m);
    expect(buildRobotsTxt("")).not.toContain("Sitemap:");
  });
});
