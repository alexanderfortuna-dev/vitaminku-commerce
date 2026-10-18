import { describe, expect, it } from "vitest";
import {
  gridToFullRows,
  planFullImport,
  publishMissing,
  skuFromPhotoName,
  type ExistingProduct,
} from "../seller-import";
import { MSG } from "../import-messages";

const existing: ExistingProduct[] = [
  {
    id: "p1", sku: "OLD-1", name: "Whey Lama", brand: "B", category: "Sport Nutrition",
    description: null, price: 100000, stock: 3, weight_grams: null, bpom_number: null,
    images: [], is_active: true, is_blocked: false,
  },
];

const header = ["SKU", "Nama", "Brand", "Kategori", "Deskripsi", "Harga", "Stok", "Berat_gram", "BPOM",
  "Foto_1", "Foto_2", "Foto_3", "Foto_4", "Foto_5", "Foto_6", "Foto_7", "Foto_8", "Foto_9", "Status"];
const row = (sku: string, nama: string, harga: string, extra: Partial<{ foto: string; status: string; berat: string }> = {}) =>
  [sku, nama, "Brand X", "Vitamin & Suplemen", "", harga, "3", extra.berat ?? "250", "",
    extra.foto ?? "https://cdn.example.com/a.jpg", "", "", "", "", "", "", "", "", extra.status ?? "Live"];

describe("Upload Massal dry-run", () => {
  it("catches a missing-price row and a blocked-keyword row in a 6-row file", () => {
    const grid = [
      header,
      row("N-1", "Vitamin C 1000", "Rp 125.000"),
      row("N-2", "Zinc", "50.000"),
      row("N-3", "Magnesium", ""), // missing price
      row("N-4", "DHEA 50mg", "200000"), // blocked keyword
      row("N-5", "Omega 3", "150000"),
      row("OLD-1", "Whey Lama", "100000", { berat: "1000" }),
    ];
    const rows = gridToFullRows(grid);
    const blocked = ["", "", "", "DHEA", "", ""];
    const plan = planFullImport(rows, existing, "fill", blocked);
    expect(plan.totalRows).toBe(6);
    expect(plan.errors).toEqual([{ row: 5, sku: "N-4", reason: MSG.blocked("DHEA") }]);
    expect(plan.drafts).toEqual([{ row: 4, sku: "N-3", reason: MSG.draft(["tanpa harga"]) }]);
    expect(plan.rows.filter((r) => r.kind === "new").map((r) => r.sku)).toEqual(["N-1", "N-2", "N-3", "N-5"]);
    expect(plan.rows.find((r) => r.sku === "N-1")?.patch.price).toBe(125000);
  });

  it("fill mode keeps existing values; overwrite replaces them", () => {
    const rows = gridToFullRows([header, row("OLD-1", "Nama Baru", "90000", { berat: "1000" })]);
    const fill = planFullImport(rows, existing, "fill");
    expect(fill.rows[0]?.patch).toEqual({ weight_grams: 1000 });
    const over = planFullImport(rows, existing, "overwrite");
    expect(over.rows[0]?.patch).toMatchObject({ name: "Nama Baru", price: 90000, weight_grams: 1000 });
  });

  it("rejects non-numeric, zero price, zero weight and unknown status", () => {
    const rows = gridToFullRows([
      header,
      row("A", "A", "abc"),
      row("B", "B", "0"),
      row("C", "C", "1000", { berat: "0" }),
      row("D", "D", "1000", { status: "jual" }),
    ]);
    const plan = planFullImport(rows, [], "fill");
    expect(plan.errors.map((e) => e.sku)).toEqual(["A", "B", "C", "D"]);
    expect(plan.rows).toHaveLength(0);
  });
});

describe("publish rule", () => {
  it("needs price > 0, photo, stock >= 0 and weight > 0", () => {
    expect(publishMissing({ price: 125000, hasPhoto: true, stock: 0, weight: 200 })).toEqual([]);
    expect(publishMissing({ price: null, hasPhoto: false, stock: 3, weight: null })).toEqual([
      "tanpa harga", "tanpa foto", "tanpa berat",
    ]);
  });
});

describe("photo ZIP names", () => {
  it("maps SKU.jpg and SKU_2.jpg", () => {
    expect(skuFromPhotoName("folder/ABC-1.jpg")).toEqual({ sku: "ABC-1", order: 1 });
    expect(skuFromPhotoName("ABC-1_2.webp")).toEqual({ sku: "ABC-1", order: 2 });
    expect(skuFromPhotoName("__MACOSX/._x.jpg")).toBeNull();
    expect(skuFromPhotoName("notes.txt")).toBeNull();
  });
});

describe("Upload Massal: contoh 20 baris dengan 2 baris rusak", () => {
  it("mengimpor 18 baris dan melaporkan 2 baris beserta alasannya", () => {
    const grid: string[][] = [header];
    for (let i = 1; i <= 20; i++) grid.push(row(`S-${i}`, `Produk ${i}`, String(50000 + i * 1000)));
    grid[7] = row("S-7", "Produk 7", "gratis"); // harga bukan angka
    grid[13] = row("S-13", "DHEA 50mg", "200000"); // kata terlarang (diisi dari hasil DB)
    const rows = gridToFullRows(grid);
    const blocked = rows.map((r) => (String(r.sku) === "S-13" ? "DHEA" : ""));
    const plan = planFullImport(rows, existing, "fill", blocked);
    expect(plan.totalRows).toBe(20);
    expect(plan.rows).toHaveLength(18);
    expect(plan.rows.every((r) => r.kind === "new")).toBe(true);
    expect(plan.errors.map((e) => [e.row, e.sku])).toEqual([[8, "S-7"], [14, "S-13"]]);
    expect(plan.errors.every((e) => e.reason.length > 0)).toBe(true);
  });
});
