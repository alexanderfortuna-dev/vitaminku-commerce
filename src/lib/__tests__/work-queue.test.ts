import { describe, expect, it } from "vitest";
import {
  buildQueue,
  clampOffset,
  compareQueueRows,
  countByFilter,
  filterQueue,
  isValidFilter,
  nextOffset,
  queueIssues,
  queueOrClause,
  type QueueRowInput,
} from "../work-queue";

const row = (id: string, patch: Partial<QueueRowInput> = {}): QueueRowInput => ({
  id,
  sku: `SKU-${id}`,
  name: `Produk ${id}`,
  brand: "B",
  price: 1000,
  stock: 5,
  weight_grams: 100,
  image_url: "https://img/a.jpg",
  is_active: true,
  is_blocked: false,
  is_hero: false,
  ...patch,
});

describe("queueIssues", () => {
  it("lengkap -> tidak ada masalah", () => expect(queueIssues(row("a"))).toEqual([]));
  it("mendeteksi foto, harga (null & 0), berat (null & 0)", () => {
    expect(queueIssues(row("a", { image_url: null }))).toEqual(["no_photo"]);
    expect(queueIssues(row("a", { price: null }))).toEqual(["no_price"]);
    expect(queueIssues(row("a", { price: 0 }))).toEqual(["no_price"]);
    expect(queueIssues(row("a", { weight_grams: null }))).toEqual(["no_weight"]);
    expect(queueIssues(row("a", { weight_grams: 0 }))).toEqual(["no_weight"]);
    expect(queueIssues(row("a", { image_url: null, price: null, weight_grams: null }))).toEqual([
      "no_photo",
      "no_price",
      "no_weight",
    ]);
  });
});

describe("buildQueue", () => {
  const rows = [
    row("1", { name: "Zinc", image_url: null }),
    row("2", { name: "Omega", price: null, is_hero: true }),
    row("3", { name: "Whey", weight_grams: null }),
    row("4", { name: "Lengkap" }),
    row("5", { name: "Draf tanpa foto", image_url: null, is_active: false }),
    row("6", { name: "Terlarang", image_url: null, is_blocked: true }),
    row("7", { name: "Alpha", price: null, is_hero: true }),
  ];

  it("hanya produk aktif, tidak diblokir, dan bermasalah; Hero lebih dulu lalu nama", () => {
    const q = buildQueue(rows);
    expect(q.map((r) => r.id)).toEqual(["7", "2", "3", "1"]);
    expect(q.slice(0, 2).every((r) => r.is_hero)).toBe(true);
  });

  it("filter per jenis masalah", () => {
    expect(buildQueue(rows, "NO_PHOTO").map((r) => r.id)).toEqual(["1"]);
    expect(buildQueue(rows, "NO_PRICE").map((r) => r.id)).toEqual(["7", "2"]);
    expect(buildQueue(rows, "NO_WEIGHT").map((r) => r.id)).toEqual(["3"]);
  });

  it("produk harga 0/null tidak pernah ditandai bisa dibeli", () => {
    const q = buildQueue(rows);
    for (const r of q.filter((x) => x.issues.includes("no_price"))) expect(r.purchasable).toBe(false);
    // stok 0 juga tidak bisa dibeli walau lengkap harganya
    const noStock = filterQueue([row("8", { image_url: null, stock: 0 })]);
    expect(noStock[0]!.purchasable).toBe(false);
    // produk bermasalah foto saja tapi harga & stok ok memang bisa dibeli
    expect(q.find((r) => r.id === "1")!.purchasable).toBe(true);
  });

  it("filterQueue mempertahankan urutan masukan (urutan dari database)", () => {
    const ordered = [row("b", { name: "B", image_url: null }), row("a", { name: "A", image_url: null })];
    expect(filterQueue(ordered).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("hitungan per jenis hanya dari produk antrian", () => {
    expect(countByFilter(rows)).toEqual({ ALL: 4, NO_PHOTO: 1, NO_PRICE: 2, NO_WEIGHT: 1 });
  });

  it("harga/stok string numeric dinormalkan", () => {
    const [r] = buildQueue([row("x", { price: "0", stock: "2", image_url: null })]);
    expect(r!.price).toBe(0);
    expect(r!.stock).toBe(2);
    expect(r!.issues).toEqual(["no_photo", "no_price"]);
  });
});

describe("compareQueueRows", () => {
  it("Hero dulu, lalu nama, lalu id", () => {
    const a = { id: "1", name: "A", is_hero: false };
    const b = { id: "2", name: "B", is_hero: true };
    expect(compareQueueRows(a, b)).toBeGreaterThan(0);
    expect(compareQueueRows(b, a)).toBeLessThan(0);
    expect(compareQueueRows({ id: "1", name: "A", is_hero: null }, { id: "2", name: "A", is_hero: false })).toBeLessThan(0);
  });
});

describe("filter, klausa, paginasi", () => {
  it("klausa or() untuk PostgREST", () => {
    expect(queueOrClause("NO_PHOTO")).toBe("image_url.is.null");
    expect(queueOrClause("NO_PRICE")).toBe("price.is.null,price.lte.0");
    expect(queueOrClause("NO_WEIGHT")).toBe("weight_grams.is.null,weight_grams.lte.0");
    expect(queueOrClause("ALL")).toBe(
      "image_url.is.null,price.is.null,price.lte.0,weight_grams.is.null,weight_grams.lte.0",
    );
  });
  it("validasi filter dan offset", () => {
    expect(isValidFilter("NO_PHOTO")).toBe(true);
    expect(isValidFilter("DROP")).toBe(false);
    expect(clampOffset(-5)).toBe(0);
    expect(clampOffset("abc")).toBe(0);
    expect(clampOffset(31.9)).toBe(31);
    expect(clampOffset(10 ** 9)).toBe(100_000);
  });
  it("nextOffset", () => {
    expect(nextOffset(0, 30, 31)).toBe(30);
    expect(nextOffset(30, 30, 60)).toBeNull();
    expect(nextOffset(0, 30, 0)).toBeNull();
  });
});
