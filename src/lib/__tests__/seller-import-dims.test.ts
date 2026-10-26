import { describe, expect, it } from "vitest";
import { FULL_HEADERS, gridToFullRows, parseCm, planFullImport, type ExistingProduct } from "../seller-import";
import { MSG } from "../import-messages";
import { pickBefore } from "../import-snapshot";

const base = (over: Partial<ExistingProduct> = {}): ExistingProduct => ({
  id: "p1", sku: "OLD-1", name: "Whey Lama", brand: "B", category: "Sport Nutrition", description: null, price: 100000,
  stock: 3, weight_grams: 500, bpom_number: null, images: ["u"], is_active: true, is_blocked: false, ...over,
});
const H = [...FULL_HEADERS] as string[];
const line = (cells: Record<string, string>) => H.map((h) => cells[h] ?? "");
const plan = (cells: Record<string, string>[], ex: ExistingProduct[] = [base()], mode: "fill" | "overwrite" = "fill") =>
  planFullImport(gridToFullRows([H, ...cells.map(line)]), ex, mode);

describe("ukuran kemasan di Upload Massal", () => {
  it("parseCm: koma/titik desimal, satuan cm, batas 0–300, sampah ditolak", () => {
    expect(parseCm("30")).toEqual({ kind: "ok", value: 30 });
    expect(parseCm("12,5")).toEqual({ kind: "ok", value: 12.5 });
    expect(parseCm("12.5 cm")).toEqual({ kind: "ok", value: 12.5 });
    expect(parseCm("")).toEqual({ kind: "empty" });
    expect(parseCm(null)).toEqual({ kind: "empty" });
    for (const bad of ["0", "-5", "301", "abc", "1.234,5", "12,555"]) expect(parseCm(bad).kind).toBe("bad");
  });
  it("tiga ukuran lengkap masuk patch produk lama (berat tidak berubah)", () => {
    const p = plan([{ SKU: "OLD-1", Panjang_cm: "30", Lebar_cm: "20", Tinggi_cm: "10" }]);
    expect(p.errors).toEqual([]);
    expect(p.rows[0]!.patch).toEqual({ length_cm: 30, width_cm: 20, height_cm: 10 });
  });
  it("sebagian ukuran → baris ditolak dengan alasan jelas, bukan ditebak", () => {
    const p = plan([{ SKU: "OLD-1", Panjang_cm: "30", Lebar_cm: "20" }]);
    expect(p.rows).toHaveLength(0);
    expect(p.errors[0]!.reason).toBe(MSG.dimPartial);
  });
  it("ukuran tak terbaca disebut per kolom", () => {
    const p = plan([{ SKU: "OLD-1", Panjang_cm: "30", Lebar_cm: "abc", Tinggi_cm: "10" }]);
    expect(p.errors[0]!.reason).toContain("Lebar_cm");
  });
  it("mode isi: tidak menimpa ukuran yang sudah ada; mode timpa: menimpa; sama persis: tidak berubah", () => {
    const has = base({ length_cm: "10", width_cm: 10, height_cm: 10 });
    const cells = { SKU: "OLD-1", Panjang_cm: "30", Lebar_cm: "20", Tinggi_cm: "10" };
    expect(plan([cells], [has], "fill").rows).toHaveLength(0);
    expect(plan([cells], [has], "overwrite").rows[0]!.patch).toMatchObject({ length_cm: 30 });
    const same = base({ length_cm: 30, width_cm: "20.0", height_cm: 10 });
    expect(plan([cells], [same], "overwrite").rows).toHaveLength(0);
  });
  it("produk baru boleh membawa ukuran; kolom ukuran kosong tidak mengubah apa pun", () => {
    const p = plan([{ SKU: "NEW-1", Nama: "Produk Baru", Brand: "B", Kategori: "Sport Nutrition", Harga: "50000", Stok: "2", Berat_gram: "300", Panjang_cm: "15", Lebar_cm: "10", Tinggi_cm: "5" }], []);
    expect(p.rows[0]!.patch).toMatchObject({ length_cm: 15, width_cm: 10, height_cm: 5 });
    const q = plan([{ SKU: "OLD-1", Harga: "100000" }]);
    expect(q.rows).toHaveLength(0);
  });
  it("nama kolom Shopee polos (Panjang/Lebar/Tinggi) diterima; 'Berat' polos TIDAK diterima (satuan tidak pasti)", () => {
    const grid = [["SKU", "Berat", "Panjang", "Lebar", "Tinggi"], ["OLD-1", "0.5", "30", "20", "10"]];
    const r = gridToFullRows(grid)[0]!;
    expect(r.panjang).toBe("30");
    expect(r.berat).toBeUndefined();
  });
  it("cadangan impor memuat ukuran hanya bila kolomnya terbaca", () => {
    expect(pickBefore({ name: "x", length_cm: 12, width_cm: null, height_cm: 3 })).toMatchObject({ length_cm: 12, width_cm: null, height_cm: 3 });
    expect("length_cm" in pickBefore({ name: "x" })).toBe(false);
  });
});
