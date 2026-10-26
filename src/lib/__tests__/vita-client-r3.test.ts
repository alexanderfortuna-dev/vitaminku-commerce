import { describe, expect, it } from "vitest";
import { parseFinderResponse } from "../vitamin-finder-client";

const base = (products: unknown[], extra: Record<string, unknown> = {}) => ({
  status: "ok",
  idempotency_key: "k",
  confidence: 0.8,
  needs_human: false,
  result: { reply_text: "ok", product_ids: products.map((p) => (p as { id: string }).id), products, ...extra },
});

describe("klien Vita: kolom Rilis 3", () => {
  it("respons Rilis 2 (tanpa kolom baru) tetap terbaca", () => {
    const r = parseFinderResponse(base([{ id: "a", name: "A", brand: "B", price: 1000, size: null, image: null, slug: "a" }]));
    expect(r.products[0]?.reason).toBeUndefined();
    expect(r.quickReplies).toEqual([]);
    expect(r.queryHash).toBeNull();
  });
  it("kolom baru dibaca; nilai aneh dibuang", () => {
    const r = parseFinderResponse(
      base(
        [
          {
            id: "a",
            name: "A",
            brand: "B",
            price: 1000,
            slug: "a",
            reason: "Alasan",
            good_for: "x",
            not_for: "y",
            cost_per_serving: 5000,
            servings: -3,
            evidence: { ingredient: "Creatine", range: "3–5 g", source: "ISSN 2017" },
            hpp: 1,
          },
        ],
        { quick_replies: ["Bubuk", 5, "Kapsul"], query_hash: "abcdef0123456789" },
      ),
    );
    const p = r.products[0]!;
    expect(p.reason).toBe("Alasan");
    expect(p.costPerServing).toBe(5000);
    expect(p.servings).toBeUndefined();
    expect(p.evidence?.source).toBe("ISSN 2017");
    expect(JSON.stringify(p)).not.toContain("hpp");
    expect(r.quickReplies).toEqual(["Bubuk", "Kapsul"]);
    expect(r.queryHash).toBe("abcdef0123456789");
  });
});
