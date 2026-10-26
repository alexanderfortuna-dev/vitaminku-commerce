// Ubah gambar menjadi WebP berwatermark logo VitaminKu (plat putih tembus pandang, pojok kanan bawah).
// `sharp` hanya diimpor dinamis di sini (server) supaya tidak masuk bundel browser.
// Watermark memakai PNG logo yang di-inline saat build (bukan font/SVG teks) agar tampil sama di Vercel.
import logoInline from "../assets/watermark-vitaminku.png?inline";
import { MAIN_QUALITY, MAIN_WIDTH, THUMB_QUALITY, THUMB_WIDTH } from "./photo-naming";

const MAX_INPUT_PIXELS = 50_000_000;

/** Satu tombol untuk mematikan/menyalakan watermark di seluruh jalur unggah foto. */
export const WATERMARK_ENABLED = true;
export const WM_WIDTH_RATIO = 0.26; // lebar plat = 26% lebar foto
export const WM_MARGIN_RATIO = 0.03; // jarak dari tepi
export const WM_PLATE_OPACITY = 0.82;
const WM_MIN_WIDTH = 72;
export const UPLOAD_MAX_WIDTH = 1200;
export const UPLOAD_QUALITY = 85; // sedikit di atas kualitas kompres browser (82) agar tidak turun dua kali

export interface ProcessedPhoto {
  main: Uint8Array;
  thumb: Uint8Array;
  mainSize: { width: number; height: number };
  thumbSize: { width: number; height: number };
}

type Sharp = (typeof import("sharp"))["default"];

function logoBuffer(): Buffer {
  return Buffer.from(logoInline.slice(logoInline.indexOf(",") + 1), "base64");
}

/** Lapisan watermark (plat + logo) untuk foto berukuran width x height; null bila foto terlalu kecil. */
async function watermarkLayers(sharp: Sharp, width: number, height: number) {
  const outerW = Math.max(WM_MIN_WIDTH, Math.round(width * WM_WIDTH_RATIO));
  const pad = Math.round(outerW * 0.06);
  const margin = Math.round(width * WM_MARGIN_RATIO);
  const logo = await sharp(logoBuffer()).resize({ width: outerW - pad * 2 }).png().toBuffer({ resolveWithObject: true });
  const outerH = logo.info.height + pad * 2;
  if (outerW + margin * 2 > width || outerH + margin * 2 > height) return null;
  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outerW}" height="${outerH}">` +
      `<rect width="${outerW}" height="${outerH}" rx="${Math.round(outerH * 0.22)}" fill="#ffffff" fill-opacity="${WM_PLATE_OPACITY}"/></svg>`,
  );
  const left = width - outerW - margin;
  const top = height - outerH - margin;
  return [
    { input: plate, left, top },
    { input: logo.data, left: left + pad, top: top + pad },
  ];
}

/**
 * Satu foto -> WebP. `width` = lebar maksimum (tanpa memperbesar); null = ukuran apa adanya.
 * Hasil selalu mengikuti EXIF. Bila `watermark`, logo ditempel setelah ukuran akhir diketahui.
 */
export async function renderPhoto(
  input: Uint8Array,
  opts: { width: number | null; quality: number; watermark: boolean },
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  try {
    let base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
    if (opts.width) base = base.resize({ width: opts.width, withoutEnlargement: true });
    if (!opts.watermark) {
      const r = await base.webp({ quality: opts.quality }).toBuffer({ resolveWithObject: true });
      return { data: new Uint8Array(r.data), width: r.info.width, height: r.info.height };
    }
    const flat = await base.png({ compressionLevel: 1 }).toBuffer({ resolveWithObject: true }); // perantara tanpa kehilangan mutu
    const layers = await watermarkLayers(sharp, flat.info.width, flat.info.height);
    const r = await sharp(flat.data)
      .composite(layers ?? [])
      .webp({ quality: opts.quality })
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(r.data), width: r.info.width, height: r.info.height };
  } catch (e) {
    throw new Error(`gambar tidak bisa diproses (${e instanceof Error ? e.message.slice(0, 80) : "rusak"})`);
  }
}

/** Jalur impor Shopee: dua WebP, utama (lebar maks 800 px) dan thumbnail (lebar maks 400 px). */
export async function processToWebp(input: Uint8Array, opts: { watermark?: boolean } = {}): Promise<ProcessedPhoto> {
  const watermark = opts.watermark ?? WATERMARK_ENABLED;
  const a = await renderPhoto(input, { width: MAIN_WIDTH, quality: MAIN_QUALITY, watermark });
  const b = await renderPhoto(input, { width: THUMB_WIDTH, quality: THUMB_QUALITY, watermark });
  return {
    main: a.data,
    thumb: b.data,
    mainSize: { width: a.width, height: a.height },
    thumbSize: { width: b.width, height: b.height },
  };
}

/** Jalur unggah admin (satu foto): ukuran maks 1200 px, selalu WebP. */
export async function processUpload(input: Uint8Array, opts: { watermark?: boolean } = {}): Promise<Uint8Array> {
  const r = await renderPhoto(input, {
    width: UPLOAD_MAX_WIDTH,
    quality: UPLOAD_QUALITY,
    watermark: opts.watermark ?? WATERMARK_ENABLED,
  });
  return r.data;
}
