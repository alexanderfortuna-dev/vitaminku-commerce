// Nama berkas & ukuran foto produk di bucket `product-images` (fungsi murni, tanpa jaringan/sharp).
// Pola: <sku>/<n>.webp (lebar maks 800 px) dan <sku>/<n>_thumb.webp (lebar maks 400 px).

export const MAIN_WIDTH = 800;
export const THUMB_WIDTH = 400;
export const MAIN_QUALITY = 82;
export const THUMB_QUALITY = 78;

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * SKU → nama folder aman untuk kunci penyimpanan. SKU yang sudah aman dipakai apa adanya;
 * bila ada karakter yang diganti, ditambah sidik pendek agar dua SKU berbeda tidak bertabrakan.
 */
export function safeSkuSegment(sku: string): string {
  const trimmed = String(sku ?? "").trim();
  const cleaned = trimmed.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+/, "").slice(0, 80);
  if (!cleaned) return `produk-${fnv1a(trimmed || "kosong")}`;
  return cleaned === trimmed ? cleaned : `${cleaned}-${fnv1a(trimmed)}`;
}

export function photoPaths(sku: string, n: number): { main: string; thumb: string } {
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error("Nomor foto tidak valid.");
  const seg = safeSkuSegment(sku);
  return { main: `${seg}/${n}.webp`, thumb: `${seg}/${n}_thumb.webp` };
}

/** Dari daftar nama berkas di folder SKU, nomor berikutnya yang belum dipakai (mulai 1). */
export function nextPhotoIndex(fileNames: readonly string[]): number {
  let max = 0;
  for (const name of fileNames) {
    const m = /^(\d+)(?:_thumb)?\.webp$/.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** Berapa foto lagi yang muat dalam galeri (maks 9). */
export function roomLeft(current: number, max = 9): number {
  return Math.max(0, max - current);
}
