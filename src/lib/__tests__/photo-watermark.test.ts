import { describe, expect, it } from "vitest";
import { processToWebp, processUpload, renderPhoto, WM_WIDTH_RATIO } from "../photo-process.server";

async function makeImage(width: number, height: number, format: "jpeg" | "png" = "jpeg", alpha = false) {
  const sharp = (await import("sharp")).default;
  const img = sharp({
    create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 20, g: 120, b: 60, alpha: 0 } : { r: 30, g: 90, b: 160 } },
  });
  return new Uint8Array(await (format === "jpeg" ? img.jpeg() : img.png()).toBuffer());
}
async function raw(webp: Uint8Array) {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, ...info };
}
/** Rata-rata selisih piksel di kotak (x0,y0)-(x1,y1) antara dua gambar sama ukuran. */
function diff(a: Awaited<ReturnType<typeof raw>>, b: Awaited<ReturnType<typeof raw>>, x0: number, y0: number, x1: number, y1: number) {
  let total = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * a.width + x) * 4;
      total += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
      n += 3;
    }
  }
  return total / n;
}

describe("watermark VitaminKu", () => {
  it("hanya pojok kanan bawah yang berubah; sisanya sama", async () => {
    const src = await makeImage(1000, 800);
    const plain = await raw((await renderPhoto(src, { width: null, quality: 90, watermark: false })).data);
    const marked = await raw((await renderPhoto(src, { width: null, quality: 90, watermark: true })).data);
    expect(marked.width).toBe(1000);
    expect(marked.height).toBe(800);
    expect(diff(plain, marked, 0, 0, 500, 400)).toBeLessThan(1); // kiri atas tidak tersentuh
    expect(diff(plain, marked, 700, 640, 960, 770)).toBeGreaterThan(20); // area watermark berubah jelas
  });

  it("lebar plat mengikuti rasio dan tidak keluar dari foto", async () => {
    expect(WM_WIDTH_RATIO).toBeGreaterThan(0.1);
    expect(WM_WIDTH_RATIO).toBeLessThan(0.4);
  });

  it("jalur Shopee: ukuran 800/400 tetap, kedua hasil berwatermark secara default", async () => {
    const src = await makeImage(1600, 1200);
    const withWm = await processToWebp(src);
    const without = await processToWebp(src, { watermark: false });
    expect(withWm.mainSize).toEqual({ width: 800, height: 600 });
    expect(withWm.thumbSize).toEqual({ width: 400, height: 300 });
    const a = await raw(withWm.main);
    const b = await raw(without.main);
    expect(diff(a, b, 520, 470, 780, 590)).toBeGreaterThan(20);
    const ta = await raw(withWm.thumb);
    const tb = await raw(without.thumb);
    expect(diff(ta, tb, 260, 235, 390, 295)).toBeGreaterThan(20);
  });

  it("jalur unggah admin: WebP, maks 1200 px, foto kecil tidak diperbesar", async () => {
    const big = await processUpload(await makeImage(3000, 2000));
    const m = await raw(big);
    expect(m.width).toBe(1200);
    expect(String.fromCharCode(...big.slice(0, 4))).toBe("RIFF");
    const small = await raw(await processUpload(await makeImage(600, 600, "png")));
    expect(small.width).toBe(600);
  });

  it("PNG transparan dan foto sangat kecil tidak melempar galat", async () => {
    await expect(processUpload(await makeImage(800, 800, "png", true))).resolves.toBeInstanceOf(Uint8Array);
    const tiny = await raw(await processUpload(await makeImage(60, 40)));
    expect([tiny.width, tiny.height]).toEqual([60, 40]); // terlalu kecil: tanpa watermark, tetap jadi
  });

  it("file rusak ditolak dengan pesan Indonesia", async () => {
    await expect(processUpload(new Uint8Array(300).fill(9))).rejects.toThrow(/tidak bisa diproses/);
  });
});
