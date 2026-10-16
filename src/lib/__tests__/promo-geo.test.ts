import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPromoRunning, lineDiscount, promoAppliesTo, type Promo } from "../promo";
import { quoteOrderLines } from "../order-pricing";
import { haversineKm, nearestBranch, parseMapsUrl } from "../geo";
import { cleanReferral } from "../referral";

const FITLIFE: Promo = {
  code: "FITLIFE10", label: "Diskon 10% Semua FITLIFE", kind: "percent", value: 10, brand: "fitlife",
  starts_at: "2026-11-01T00:00:00+08:00", ends_at: "2026-12-01T23:59:59+08:00",
};

describe("promo window (WITA)", () => {
  it("is not running before 1 Nov 00:00 WITA", () => {
    expect(isPromoRunning(FITLIFE, new Date("2026-10-31T23:59:59+08:00"))).toBe(false);
  });
  it("runs from 1 Nov 00:00 WITA and on 1 Dec 23:59:59 WITA", () => {
    expect(isPromoRunning(FITLIFE, new Date("2026-11-01T00:00:00+08:00"))).toBe(true);
    expect(isPromoRunning(FITLIFE, new Date("2026-12-01T23:59:59+08:00"))).toBe(true);
  });
  it("stops after 1 Dec 23:59:59 WITA", () => {
    expect(isPromoRunning(FITLIFE, new Date("2026-12-02T00:00:00+08:00"))).toBe(false);
  });
  it("respects is_active=false", () => {
    expect(isPromoRunning({ ...FITLIFE, is_active: false }, new Date("2026-11-15T12:00:00+08:00"))).toBe(false);
  });
});

describe("promo brand + rounding", () => {
  it("matches brand case-insensitively, not other brands", () => {
    expect(promoAppliesTo(FITLIFE, "Fitlife")).toBe(true);
    expect(promoAppliesTo(FITLIFE, " FITLIFE ")).toBe(true);
    expect(promoAppliesTo(FITLIFE, "Provus")).toBe(false);
  });
  it("rounds 10% to the nearest rupiah", () => {
    expect(lineDiscount(125_005, FITLIFE)).toBe(12_501);
    expect(lineDiscount(125_004, FITLIFE)).toBe(12_500);
  });
  it("server quote discounts only Fitlife lines inside the window", () => {
    const rows = [
      { slug: "a", name: "A", price: 200000, stock: 5, is_active: true, is_blocked: false, brand: "Fitlife" },
      { slug: "b", name: "B", price: 100000, stock: 5, is_active: true, is_blocked: false, brand: "Provus" },
    ];
    const lines = [{ slug: "a", quantity: 2 }, { slug: "b", quantity: 1 }];
    const inside = quoteOrderLines(lines, rows, FITLIFE, new Date("2026-11-10T10:00:00+08:00"));
    expect(inside.subtotal).toBe(500000);
    expect(inside.discount).toBe(40000);
    expect(inside.promoCode).toBe("FITLIFE10");
    const after = quoteOrderLines(lines, rows, FITLIFE, new Date("2026-12-02T00:00:01+08:00"));
    expect(after.discount).toBe(0);
    expect(after.promoCode).toBeNull();
  });
});

describe("branch geo", () => {
  it("parses common Google Maps links and rejects out-of-range", () => {
    expect(parseMapsUrl("https://www.google.com/maps/place/X/@-8.6705,115.2126,17z")).toEqual({ lat: -8.6705, lng: 115.2126 });
    expect(parseMapsUrl("https://maps.google.com/?q=-8.65,115.22")).toEqual({ lat: -8.65, lng: 115.22 });
    expect(parseMapsUrl("https://www.google.com/maps/place/X/data=!3d-8.7!4d115.17")).toEqual({ lat: -8.7, lng: 115.17 });
    expect(parseMapsUrl("-8.65, 115.22")).toEqual({ lat: -8.65, lng: 115.22 });
    expect(parseMapsUrl("https://maps.google.com/?q=95,200")).toBeNull();
    expect(parseMapsUrl("https://maps.app.goo.gl/abc")).toBeNull();
  });
  it("picks the nearest branch with coordinates, never one without", () => {
    const here = { lat: -8.65, lng: 115.21 }; // Denpasar
    const r = nearestBranch(
      [
        { id: "none", lat: null, lng: null },
        { id: "ubud", lat: -8.5069, lng: 115.2625 },
        { id: "kuta", lat: -8.7184, lng: 115.1686 },
      ],
      here,
    );
    expect(r?.branch.id).toBe("kuta");
    expect(nearestBranch([{ id: "none", lat: null, lng: null }], here)).toBeNull();
    expect(Math.round(haversineKm(here, { lat: -8.5069, lng: 115.2625 }))).toBe(17);
  });
  it("cleans referral codes", () => {
    expect(cleanReferral(" ab12 ")).toBe("AB12");
    expect(cleanReferral("<script>")).toBeNull();
  });
});

describe("hpp never reaches public code", () => {
  // Only staff-only server modules and generated types may mention the cost column.
  const ALLOWED = [/^integrations\/supabase\/types\.ts$/, /^lib\/admin[^/]*\.functions\.ts$/, /^lib\/seller[^/]*\.ts$/, /^lib\/bulk-price-stock[^/]*\.ts$/, /^lib\/backup\.functions\.ts$/, /^routes\/admin\//, /__tests__\//];
  const root = join(__dirname, "..", "..");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p.slice(root.length + 1).replace(/\\/g, "/"));
    }
  };
  walk(root);
  it("no public file references hpp", () => {
    const offenders = files.filter((f) => !ALLOWED.some((re) => re.test(f)) && /\bhpp\b/i.test(readFileSync(join(root, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
