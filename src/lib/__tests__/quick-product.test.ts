import { describe, expect, it } from "vitest";
import {
  classifyInsertError,
  cleanQuickProduct,
  insertErrorMessage,
  parseWhole,
  temporarySku,
} from "../quick-product";

const base = { name: " Vitamin C ", brand: "Nature", category: "Vitamin & Suplemen" };

describe("cleanQuickProduct", () => {
  it("admin: semua kolom diterima dan dibersihkan", () => {
    expect(cleanQuickProduct({ ...base, price: "Rp 125.000", stock: "3", weight_grams: "250" }, "admin")).toEqual({
      name: "Vitamin C",
      brand: "Nature",
      category: "Vitamin & Suplemen",
      price: 125000,
      stock: 3,
      weight_grams: 250,
      sku: null,
    });
  });
  it("stok kosong = 0; harga/berat kosong = null (tetap Draf)", () => {
    const c = cleanQuickProduct(base, "owner");
    expect(c.stock).toBe(0);
    expect(c.price).toBeNull();
    expect(c.weight_grams).toBeNull();
  });
  it("nama, merek, kategori wajib", () => {
    expect(() => cleanQuickProduct({ ...base, name: "  " }, "admin")).toThrow(/Nama/);
    expect(() => cleanQuickProduct({ ...base, brand: "" }, "admin")).toThrow(/Merek/);
    expect(() => cleanQuickProduct({ ...base, category: "" }, "admin")).toThrow(/Kategori/);
  });
  it("harga 0 dan berat 0 ditolak", () => {
    expect(() => cleanQuickProduct({ ...base, price: "0" }, "admin")).toThrow(/Harga/);
    expect(() => cleanQuickProduct({ ...base, weight_grams: "0" }, "admin")).toThrow(/Berat/);
  });
  it("seller: tanpa harga/stok/berat boleh; dengan itu ditolak 403", () => {
    expect(cleanQuickProduct(base, "seller").stock).toBe(0);
    expect(() => cleanQuickProduct({ ...base, price: "1000" }, "seller")).toThrow(/403/);
    expect(() => cleanQuickProduct({ ...base, stock: "5" }, "seller")).toThrow(/403/);
    expect(() => cleanQuickProduct({ ...base, weight_grams: "100" }, "seller")).toThrow(/403/);
  });
  it("tanpa peran ditolak untuk kolom komersial", () => {
    expect(() => cleanQuickProduct({ ...base, price: "1000" }, null)).toThrow(/403/);
  });
});

describe("parseWhole", () => {
  it("angka saja", () => {
    expect(parseWhole("1.250", "x", 0)).toBe(1250);
    expect(parseWhole("", "x", 0)).toBeNull();
    expect(parseWhole(undefined, "x", 0)).toBeNull();
    expect(() => parseWhole("0", "Harga", 1)).toThrow(/Harga/);
  });
});

describe("temporarySku", () => {
  it("format QC-YYMMDD-XXXXX dan deterministik dengan random tetap", () => {
    const sku = temporarySku(new Date("2026-10-13T05:00:00Z"), () => 0);
    expect(sku).toBe("QC-261013-AAAAA");
    expect(temporarySku()).toMatch(/^QC-\d{6}-[A-Z2-9]{5}$/);
  });
});

describe("galat insert", () => {
  it("diklasifikasi", () => {
    expect(classifyInsertError('new row violates row-level security policy for table "products"')).toBe("permission");
    expect(classifyInsertError('duplicate key value violates unique constraint "products_sku_key"')).toBe("sku");
    expect(classifyInsertError('duplicate key value violates unique constraint "products_slug_key"')).toBe("slug");
    expect(classifyInsertError("boom")).toBe("other");
  });
  it("pesan Indonesia", () => {
    expect(insertErrorMessage("permission", "", "X")).toContain("admin/owner");
    expect(insertErrorMessage("sku", "", "ABC")).toContain("ABC");
    expect(insertErrorMessage("slug", "", "X")).toContain("Nama");
  });
});
