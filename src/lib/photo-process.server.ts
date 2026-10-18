// Ubah gambar unduhan menjadi dua WebP: utama (lebar maks 800 px) dan thumbnail (lebar maks 400 px).
// `sharp` hanya diimpor dinamis di sini (server) supaya tidak masuk bundel browser.
import { MAIN_QUALITY, MAIN_WIDTH, THUMB_QUALITY, THUMB_WIDTH } from "./photo-naming";

const MAX_INPUT_PIXELS = 50_000_000;

export interface ProcessedPhoto {
  main: Uint8Array;
  thumb: Uint8Array;
  mainSize: { width: number; height: number };
  thumbSize: { width: number; height: number };
}

export async function processToWebp(input: Uint8Array): Promise<ProcessedPhoto> {
  const sharp = (await import("sharp")).default;
  const open = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate(); // rotate() = ikuti EXIF
  try {
    const a = await open().resize({ width: MAIN_WIDTH, withoutEnlargement: true }).webp({ quality: MAIN_QUALITY }).toBuffer({ resolveWithObject: true });
    const b = await open().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: THUMB_QUALITY }).toBuffer({ resolveWithObject: true });
    return {
      main: new Uint8Array(a.data),
      thumb: new Uint8Array(b.data),
      mainSize: { width: a.info.width, height: a.info.height },
      thumbSize: { width: b.info.width, height: b.info.height },
    };
  } catch (e) {
    throw new Error(`gambar tidak bisa diproses (${e instanceof Error ? e.message.slice(0, 80) : "rusak"})`);
  }
}
