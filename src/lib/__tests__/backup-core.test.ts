import { describe, expect, it } from "vitest";
import {
  BACKUP_COLUMNS,
  BACKUP_KINDS,
  backupFilename,
  isBackupKind,
  safeCell,
  selectFor,
  shapeRow,
} from "../backup-core";

describe("backup core", () => {
  it("tidak ada kolom rahasia atau biaya modal di definisi kolom", () => {
    for (const kind of BACKUP_KINDS) {
      const keys = BACKUP_COLUMNS[kind].map((c) => c.key).join(",") + "," + selectFor(kind);
      expect(keys).not.toMatch(/hpp|access_token|payment_token|payment_url|user_id/i);
    }
  });

  it("safeCell menetralkan formula injection tapi tidak mengubah angka", () => {
    expect(safeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(safeCell("+62812")).toBe("'+62812");
    expect(safeCell("@a")).toBe("'@a");
    expect(safeCell("Budi")).toBe("Budi");
    expect(safeCell(-5)).toBe(-5);
    expect(safeCell(null)).toBeNull();
  });

  it("baris produk: status & jumlah foto turunan, urutan sesuai kolom", () => {
    const base = { sku: "A", name: "N", images: ["u1", "u2"], is_active: true, is_blocked: false, price: 10 };
    const header = BACKUP_COLUMNS.produk.map((c) => c.label);
    const row = shapeRow("produk", base);
    expect(row).toHaveLength(header.length);
    expect(row[header.indexOf("Status")]).toBe("Live");
    expect(row[header.indexOf("Jumlah_foto")]).toBe(2);
    expect(shapeRow("produk", { ...base, is_active: false })[header.indexOf("Status")]).toBe("Draf");
    expect(shapeRow("produk", { ...base, is_blocked: true })[header.indexOf("Status")]).toBe("Diblokir");
  });

  it("jenis & nama file", () => {
    expect(isBackupKind("pesanan")).toBe(true);
    expect(isBackupKind("users")).toBe(false);
    expect(backupFilename("item_pesanan", "csv", new Date("2026-10-13T01:00:00Z"))).toBe("cadangan-item-pesanan-2026-10-13.csv");
    expect(selectFor("pesanan").split(",").filter((c) => c === "id")).toHaveLength(1);
  });
});
