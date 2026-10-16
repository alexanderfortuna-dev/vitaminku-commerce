import { describe, expect, it } from "vitest";
import { quoteOrderLines } from "../order-pricing";
import type { Promo } from "../promo";

// Sama persis dengan baris FITLIFE10 di migrasi 0008 (WITA = UTC+8).
const FITLIFE10: Promo = {
  code: "FITLIFE10", label: "Diskon 10% Semua FITLIFE", kind: "percent", value: 10, brand: "fitlife",
  starts_at: "2026-10-31T16:00:00Z", ends_at: "2026-12-01T15:59:59Z", is_active: true,
};
const rows = [
  { slug: "fit-a", name: "Fit A", price: 200000, stock: 9, is_active: true, is_blocked: false, brand: "Fitlife" },
  { slug: "pro-b", name: "Pro B", price: 100000, stock: 9, is_active: true, is_blocked: false, brand: "Provus" },
];
const lines = [{ slug: "fit-a", quantity: 1 }, { slug: "pro-b", quantity: 1 }];

describe("FITLIFE10 – jam diinjeksi", () => {
  it("sebelum 1 Nov 00:00 WITA: tanpa diskon", () => {
    const q = quoteOrderLines(lines, rows, FITLIFE10, new Date("2026-10-31T15:59:59Z"));
    expect(q.discount).toBe(0);
    expect(q.promoCode).toBeNull();
  });
  it("di dalam jendela: 10% hanya untuk Fitlife", () => {
    const q = quoteOrderLines(lines, rows, FITLIFE10, new Date("2026-11-15T04:00:00Z"));
    expect(q.discount).toBe(20000);
    expect(q.promoCode).toBe("FITLIFE10");
  });
  it("setelah 1 Des 23:59:59 WITA: tanpa diskon", () => {
    const q = quoteOrderLines(lines, rows, FITLIFE10, new Date("2026-12-01T16:00:00Z"));
    expect(q.discount).toBe(0);
  });
  it("harga dihitung server dari data DB; harga kiriman klien diabaikan", () => {
    const tampered = [{ slug: "fit-a", quantity: 1, price: 1, unit_price: 1 }] as never;
    const q = quoteOrderLines(tampered, rows, FITLIFE10, new Date("2026-11-15T04:00:00Z"));
    expect(q.subtotal).toBe(200000);
    expect(q.discount).toBe(20000);
  });
});
