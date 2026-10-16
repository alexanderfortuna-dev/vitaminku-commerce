import { describe, expect, it } from "vitest";
import {
  evaluateReadiness,
  isPurchasable,
  publishState,
  readinessSummary,
  type ReadinessInput,
} from "../product-readiness";

const full: ReadinessInput = {
  price: 125000,
  image_url: "https://img/x.jpg",
  stock: 3,
  weight_grams: 250,
  is_blocked: false,
  is_active: false,
};

describe("evaluateReadiness (cermin publish_missing + blokir)", () => {
  it("semua hijau -> ready", () => {
    const r = evaluateReadiness(full);
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.items.every((i) => i.ok)).toBe(true);
    expect(publishState(full)).toBe("ready");
  });

  it.each([
    ["harga null", { price: null }, "price"],
    ["harga 0", { price: 0 }, "price"],
    ["harga string kosong", { price: "" }, "price"],
    ["foto tidak ada", { image_url: null, images: [] }, "photo"],
    ["foto string kosong", { image_url: "  ", images: [] }, "photo"],
    ["stok negatif", { stock: -1 }, "stock"],
    ["stok null", { stock: null }, "stock"],
    ["stok pecahan", { stock: 1.5 }, "stock"],
    ["berat null", { weight_grams: null }, "weight"],
    ["berat 0", { weight_grams: 0 }, "weight"],
    ["diblokir", { is_blocked: true, blocked_reason: "DHEA" }, "not_blocked"],
  ] as const)("%s -> merah dan tidak ready", (_n, patch, key) => {
    const r = evaluateReadiness({ ...full, ...patch });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain(key);
    expect(publishState({ ...full, ...patch })).not.toBe("ready");
  });

  it("stok 0 valid (aturan: stok >= 0), harga angka string diterima", () => {
    expect(evaluateReadiness({ ...full, stock: 0 }).ready).toBe(true);
    expect(evaluateReadiness({ ...full, price: "99000", weight_grams: "100" }).ready).toBe(true);
  });

  it("foto dari galeri (images) tanpa image_url tetap dihitung", () => {
    expect(evaluateReadiness({ ...full, image_url: null, images: ["https://img/a.jpg"] }).ready).toBe(true);
  });

  it("semua kurang -> semua merah kecuali stok valid", () => {
    const r = evaluateReadiness({ price: null, image_url: null, stock: 0, weight_grams: null, is_blocked: false });
    expect(r.missing).toEqual(["price", "photo", "weight"]);
  });

  it("diblokir tidak punya tautan perbaikan; lainnya punya", () => {
    const r = evaluateReadiness({ ...full, price: null, is_blocked: true, blocked_reason: "DHEA" });
    const byKey = Object.fromEntries(r.items.map((i) => [i.key, i]));
    expect(byKey["price"]!.fix).toBe("product");
    expect(byKey["not_blocked"]!.fix).toBeNull();
    expect(byKey["not_blocked"]!.problem).toContain("DHEA");
  });

  it("status tombol: blocked, live, incomplete", () => {
    expect(publishState({ ...full, is_blocked: true })).toBe("blocked");
    expect(publishState({ ...full, is_active: true })).toBe("live");
    expect(publishState({ ...full, price: 0 })).toBe("incomplete");
  });

  it("ringkasan memuat masalah", () => {
    expect(readinessSummary(evaluateReadiness({ ...full, price: null }))).toContain("harga belum diisi");
    expect(readinessSummary(evaluateReadiness(full))).toContain("Siap ditayangkan");
    expect(readinessSummary(evaluateReadiness({ ...full, is_active: true }))).toContain("sudah tayang");
  });
});

describe("isPurchasable (jangan tampil bisa dibeli bila tidak bisa)", () => {
  const ok = { is_active: true, is_blocked: false, price: 1000, stock: 1 };
  it("hanya aktif + tidak diblokir + harga>0 + stok>0", () => {
    expect(isPurchasable(ok)).toBe(true);
    expect(isPurchasable({ ...ok, is_active: false })).toBe(false);
    expect(isPurchasable({ ...ok, is_blocked: true })).toBe(false);
    expect(isPurchasable({ ...ok, price: 0 })).toBe(false);
    expect(isPurchasable({ ...ok, price: null })).toBe(false);
    expect(isPurchasable({ ...ok, stock: 0 })).toBe(false);
  });
});
