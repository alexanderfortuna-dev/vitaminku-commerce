import { describe, expect, it } from "vitest";
import { gridToRows, parseCsv, parseIdrNumber, planImport, type CurrentProduct } from "../bulk-price-stock";

const ok = (v: number) => ({ kind: "ok", value: v });

describe("parseIdrNumber", () => {
  it("accepts Indonesian formats", () => {
    expect(parseIdrNumber("Rp 125.000")).toEqual(ok(125000));
    expect(parseIdrNumber("Rp125.000")).toEqual(ok(125000));
    expect(parseIdrNumber("125.000")).toEqual(ok(125000));
    expect(parseIdrNumber("125000")).toEqual(ok(125000));
    expect(parseIdrNumber("1.250.000")).toEqual(ok(1250000));
    expect(parseIdrNumber("125.000,50")).toEqual(ok(125000.5));
    expect(parseIdrNumber(125000)).toEqual(ok(125000));
  });
  it("treats empty as unchanged", () => {
    expect(parseIdrNumber("")).toEqual({ kind: "empty" });
    expect(parseIdrNumber("  ")).toEqual({ kind: "empty" });
    expect(parseIdrNumber(null)).toEqual({ kind: "empty" });
  });
  it("rejects non-numeric and negative", () => {
    expect(parseIdrNumber("abc").kind).toBe("error");
    expect(parseIdrNumber("12.34.5").kind).toBe("error");
    expect(parseIdrNumber("-5000").kind).toBe("error");
    expect(parseIdrNumber(-1).kind).toBe("error");
  });
});

const products: CurrentProduct[] = [
  { id: "1", sku: "A1", name: "A", price: null, compare_at_price: null, stock: 0 },
  { id: "2", sku: "B2", name: "B", price: 100000, compare_at_price: null, stock: 5 },
  { id: "3", sku: "C3", name: "C", price: null, compare_at_price: null, stock: 0 },
];

describe("planImport", () => {
  it("classifies rows and only patches changed fields", () => {
    const plan = planImport(
      [
        { row: 2, sku: "A1", harga_jual: "Rp 125.000", harga_coret: "150.000", stok: "10" },
        { row: 3, sku: "B2", harga_jual: "100000", harga_coret: "", stok: 5 },
        { row: 4, sku: "ZZ", harga_jual: "1", harga_coret: "", stok: "" },
        { row: 5, sku: "C3", harga_jual: "0", harga_coret: "", stok: "" },
        { row: 6, sku: "a1", harga_jual: "1", harga_coret: "", stok: "" },
      ],
      products,
    );
    expect(plan.updates).toEqual([
      { id: "1", sku: "A1", patch: { price: 125000, compare_at_price: 150000, stock: 10 } },
    ]);
    expect(plan.unchanged).toBe(1);
    expect(plan.unknownSku.map((e) => e.sku)).toEqual(["ZZ"]);
    expect(plan.invalid.map((e) => e.row)).toEqual([5, 6]);
  });
  it("rejects harga_coret <= harga_jual and negative stock", () => {
    const plan = planImport(
      [
        { row: 2, sku: "A1", harga_jual: "100.000", harga_coret: "100.000", stok: "" },
        { row: 3, sku: "C3", harga_jual: "", harga_coret: "", stok: "-2" },
      ],
      products,
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.invalid).toHaveLength(2);
  });
});

describe("csv", () => {
  it("parses semicolon CSV with quotes into rows", () => {
    const grid = parseCsv('sku;nama_produk;harga_jual;stok\n"A1";"Whey; 1kg";"Rp 125.000";3\n');
    const rows = gridToRows(grid);
    expect(rows[0]).toMatchObject({ row: 2, sku: "A1", harga_jual: "Rp 125.000", stok: "3" });
  });
});
