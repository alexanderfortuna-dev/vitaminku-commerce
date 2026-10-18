import { describe, expect, it } from "vitest";
import {
  MAIN_WIDTH,
  THUMB_WIDTH,
  nextPhotoIndex,
  photoPaths,
  roomLeft,
  safeSkuSegment,
} from "../photo-naming";

describe("nama berkas foto", () => {
  it("pola <sku>/<n>.webp dan <sku>/<n>_thumb.webp", () => {
    expect(photoPaths("VK-001", 1)).toEqual({ main: "VK-001/1.webp", thumb: "VK-001/1_thumb.webp" });
    expect(photoPaths("VK-001", 9)).toEqual({ main: "VK-001/9.webp", thumb: "VK-001/9_thumb.webp" });
  });

  it("SKU aman dipakai apa adanya", () => {
    expect(safeSkuSegment("Abc_12.x-9")).toBe("Abc_12.x-9");
  });

  it("karakter berbahaya diganti dan diberi sidik agar tidak bertabrakan", () => {
    const a = safeSkuSegment("A/B C");
    const b = safeSkuSegment("A_B C");
    expect(a).toMatch(/^A_B_C-[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[/ ]/);
  });

  it("tidak bisa keluar folder", () => {
    for (const bad of ["../../x", "..", "/etc/passwd", "a/../b", "  "]) {
      const seg = safeSkuSegment(bad);
      expect(seg).not.toContain("/");
      expect(seg.startsWith(".")).toBe(false);
      expect(photoPaths(bad, 1).main.split("/")).toHaveLength(2);
    }
  });

  it("nomor foto harus 1..999 bulat", () => {
    expect(() => photoPaths("A", 0)).toThrow();
    expect(() => photoPaths("A", 1.5)).toThrow();
    expect(() => photoPaths("A", 1000)).toThrow();
  });

  it("nomor berikutnya tidak menimpa berkas yang ada", () => {
    expect(nextPhotoIndex([])).toBe(1);
    expect(nextPhotoIndex(["1.webp", "1_thumb.webp", "2.webp", "2_thumb.webp"])).toBe(3);
    expect(nextPhotoIndex(["3.webp", "x.jpg", ".emptyFolderPlaceholder"])).toBe(4);
    expect(nextPhotoIndex(["7_thumb.webp"])).toBe(8);
  });
});

describe("ukuran keluaran", () => {
  it("lebar maks 800 dan thumbnail 400", () => {
    expect(MAIN_WIDTH).toBe(800);
    expect(THUMB_WIDTH).toBe(400);
  });

  it("sisa tempat galeri maks 9", () => {
    expect(roomLeft(0)).toBe(9);
    expect(roomLeft(7)).toBe(2);
    expect(roomLeft(12)).toBe(0);
  });
});
