import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatIssue, MSG, isSampleSku } from "../import-messages";
import { FULL_HEADERS, gridToFullRows, planFullImport, type ExistingProduct } from "../seller-import";
import { TEMPLATE_CATEGORIES, TEMPLATE_STATUSES, templateInstructionLines, templateSampleRows } from "../import-template";
import { SNAPSHOT_KEYS, buildSnapshotRows, pickBefore } from "../import-snapshot";
import { CATEGORIES } from "../catalog";

const header = [...FULL_HEADERS] as string[];
const row = (over: Record<string, string>) => {
  const base: Record<string, string> = {
    SKU: "N-1", Nama: "Vitamin C", Brand: "Merek", Kategori: "Vitamin & Suplemen", Deskripsi: "", Harga: "125000",
    Stok: "5", Berat_gram: "200", BPOM: "", Foto_1: "https://x.id/a.jpg", Status: "Draf",
  };
  const m = { ...base, ...over };
  return header.map((h) => m[h] ?? "");
};
const plan = (cells: string[], existing: ExistingProduct[] = []) =>
  planFullImport(gridToFullRows([header, cells]), existing, "fill");

describe("pesan validasi Upload Massal (bahasa sederhana)", () => {
  it("harga bukan angka: sebut kolom, nilai, dan contoh perbaikan", () => {
    const e = plan(row({ Harga: "seratus" })).errors[0]!;
    expect(e.row).toBe(2);
    expect(e.reason).toContain('Harga "seratus" tidak terbaca');
    expect(e.reason).toContain("contoh 125000");
    expect(formatIssue(e)).toBe(`Baris 2 (SKU N-1): ${e.reason}`);
  });

  it("harga 0, stok pecahan, berat 0, status & foto salah punya petunjuk perbaikan", () => {
    const e = plan(row({ Harga: "0", Stok: "2,5", Berat_gram: "0", Status: "jual", Foto_1: "foto.jpg" })).errors[0]!;
    expect(e.reason).toContain(MSG.priceZero);
    expect(e.reason).toContain(MSG.stockFraction);
    expect(e.reason).toContain(MSG.weightZero);
    expect(e.reason).toContain("Isi Live (tampil di toko) atau Draf");
    expect(e.reason).toContain("diawali https://");
  });

  it("produk baru tanpa Nama/Brand/Kategori: tiap kolom disebut", () => {
    const e = plan(row({ Nama: "", Brand: "", Kategori: "" })).errors[0]!;
    expect(e.reason).toContain("kolom Nama masih kosong");
    expect(e.reason).toContain("kolom Brand masih kosong");
    expect(e.reason).toContain("kolom Kategori masih kosong");
  });

  it("tanpa istilah teknis", () => {
    const all = [MSG.skuEmpty, MSG.skuDuplicate, MSG.sample, MSG.priceZero, MSG.stockFraction, MSG.weightZero,
      MSG.status("x"), MSG.photo("x"), MSG.newRequired("Nama"), MSG.blocked("DHEA"), MSG.draft(["tanpa harga"])].join(" ");
    expect(all).not.toMatch(/\b(null|undefined|NaN|exception|trigger|RLS|constraint|URL|parse)\b/i);
  });

  it("SKU kosong, duplikat, dan baris CONTOH ditolak dengan petunjuk; tidak pernah menjadi produk", () => {
    const grid = [header, row({ SKU: "" , Nama: "x"}), row({ SKU: "A-1" }), row({ SKU: "a-1" }), row({ SKU: "CONTOH-001" })];
    const p = planFullImport(gridToFullRows(grid), [], "fill");
    expect(p.errors.map((e) => e.reason)).toEqual([MSG.skuEmpty, MSG.skuDuplicate, MSG.sample]);
    expect(p.rows.map((r) => r.sku)).toEqual(["A-1"]);
    expect(isSampleSku(" contoh-9 ")).toBe(true);
    expect(isSampleSku("VIT-1")).toBe(false);
  });
});

describe("template Upload Massal", () => {
  it("baris contoh selebar header, berawalan CONTOH, dan ditolak importer", () => {
    const rows = templateSampleRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r).toHaveLength(FULL_HEADERS.length);
      expect(String(r[0])).toMatch(/^CONTOH/);
    }
    const p = planFullImport(gridToFullRows([header, ...rows]), [], "fill");
    expect(p.rows).toHaveLength(0);
    expect(p.errors).toHaveLength(rows.length);
  });

  it("dropdown: kategori dari katalog toko, status yang diterima importer", () => {
    expect(TEMPLATE_CATEGORIES).toEqual(CATEGORIES.map((c) => c.category));
    expect([...TEMPLATE_STATUSES]).toEqual(["Live", "Draf"]);
    for (const c of TEMPLATE_CATEGORIES) expect(plan(row({ Kategori: c })).errors).toHaveLength(0);
  });

  it("petunjuk Indonesia, menyebut batalkan impor, dan tidak menyebut harga modal sebagai kolom", () => {
    const text = templateInstructionLines().join("\n");
    expect(text).toContain("Batalkan impor terakhir");
    expect(text).toContain("CONTOH");
    expect(text).toContain("Berat_gram");
    expect(text).toMatch(/Harga modal tidak ada di file ini/);
  });
});

describe("snapshot impor ↔ RPC undo_product_import", () => {
  it("kunci snapshot sama dengan yang dibaca RPC di migrasi 0013", () => {
    const sql = readFileSync(join(__dirname, "../../../drizzle/migrations/0013_import_undo.sql"), "utf8");
    const line = sql.match(/Kunci `before` yang dibaca: ([^\n]+\n--[^\n]+)/)![1]!;
    const keys = line.replace(/--/g, "").replace(/\s+/g, " ").split(".")[0]!.split(",").map((k) => k.trim()).filter(Boolean);
    expect([...SNAPSHOT_KEYS].sort()).toEqual(keys.sort());
    // dan RPC benar-benar membaca tiap kunci dari `before`
    for (const k of SNAPSHOT_KEYS) expect(sql).toMatch(new RegExp(`before->>?'${k}'`));
  });

  it("pickBefore membuang kolom lain, termasuk biaya modal", () => {
    const b = pickBefore({ id: "1", sku: "A", name: "N", hpp: 5000, price: 10, secret: "x" });
    expect(Object.keys(b).sort()).toEqual([...SNAPSHOT_KEYS].sort());
    expect(JSON.stringify(b)).not.toMatch(/hpp|5000|secret/);
    expect(b["price"]).toBe(10);
    expect(b["brand"]).toBeNull();
  });

  it("produk lama → existed + before (SKU sesuai database); produk baru → existed=false; hilang → gagal", () => {
    const rows = buildSnapshotRows(
      "imp-1",
      [
        { kind: "update", id: "p1", sku: "old-1" },
        { kind: "new", id: null, sku: "NEW-1" },
      ],
      new Map([["p1", { id: "p1", sku: "OLD-1", name: "Lama", price: 100, stock: 3, hpp: 1 }]]),
    );
    expect(rows[0]).toMatchObject({ import_id: "imp-1", sku: "OLD-1", existed: true });
    expect(rows[0]!.before).toMatchObject({ name: "Lama", price: 100, stock: 3 });
    expect(rows[0]!.before).not.toHaveProperty("hpp");
    expect(rows[1]).toEqual({ import_id: "imp-1", sku: "NEW-1", existed: false, before: null });
    expect(() => buildSnapshotRows("i", [{ kind: "update", id: "zzz", sku: "X" }], new Map())).toThrow();
  });
});
