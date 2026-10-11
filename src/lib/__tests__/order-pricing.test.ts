import { describe, expect, it } from "vitest";
import { quoteOrderLines, type PricedDbRow } from "../order-pricing";

const row = (over: Partial<PricedDbRow>): PricedDbRow => ({
  slug: "whey",
  name: "Whey",
  price: 250000,
  stock: 10,
  is_active: true,
  is_blocked: false,
  ...over,
});

describe("server order pricing", () => {
  it("uses database price, ignoring any browser-sent price", () => {
    const q = quoteOrderLines(
      [{ slug: "whey", quantity: 2, price: 1 } as never],
      [row({})],
    );
    expect(q.subtotal).toBe(500000);
    expect(q.lines[0]!.unitPrice).toBe(250000);
  });

  it("rejects blocked, inactive, unpriced and out-of-stock products", () => {
    const q = quoteOrderLines(
      [
        { slug: "a", quantity: 1 },
        { slug: "b", quantity: 1 },
        { slug: "c", quantity: 1 },
        { slug: "d", quantity: 5 },
      ],
      [
        row({ slug: "a", is_blocked: true }),
        row({ slug: "b", is_active: false }),
        row({ slug: "c", price: null }),
        row({ slug: "d", stock: 2 }),
      ],
    );
    expect(q.subtotal).toBe(0);
    expect(q.rejected.map((r) => r.reason)).toEqual([
      "unavailable",
      "unavailable",
      "no_price",
      "out_of_stock",
    ]);
  });

  it("caps quantity at 99 per line", () => {
    const q = quoteOrderLines([{ slug: "whey", quantity: 500 }], [row({ stock: 1000 })]);
    expect(q.lines[0]!.quantity).toBe(99);
  });
});
