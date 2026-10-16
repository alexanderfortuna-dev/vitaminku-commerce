// Logika murni "Siap Tayang". Cermin dari aturan tayang di database:
//   public.publish_missing(price, has_photo, stock, weight) + blokir di products_guard
//   (drizzle/migrations/0005_seller_center.sql).
// Database (trigger products_guard) tetap penegak akhir; daftar ini hanya membantu staf melihat apa yang kurang.
// Sengaja sedikit lebih ketat dari trigger pada satu hal: teks kosong di image_url dianggap "tanpa foto".

export interface ReadinessInput {
  price?: number | string | null;
  image_url?: string | null;
  images?: readonly string[] | null;
  stock?: number | string | null;
  weight_grams?: number | string | null;
  is_blocked?: boolean | null;
  blocked_reason?: string | null;
  is_active?: boolean | null;
}

export type ReadinessKey = "price" | "photo" | "stock" | "weight" | "not_blocked";

export interface ReadinessItem {
  key: ReadinessKey;
  /** Label centang saat hijau, mis. "Harga sudah diisi". */
  label: string;
  ok: boolean;
  /** Kalimat masalah saat merah, mis. "Harga belum diisi". */
  problem: string;
  /** "product" = perbaiki lewat layar produk (satu ketuk). null = staf tidak bisa memperbaiki sendiri. */
  fix: "product" | null;
}

export interface ReadinessResult {
  items: ReadinessItem[];
  /** Semua hijau: layak mencoba "Tayangkan". */
  ready: boolean;
  /** Kunci yang masih merah. */
  missing: ReadinessKey[];
  /** Produk sudah tayang (is_active) dan tidak diblokir. */
  live: boolean;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function hasPhoto(p: Pick<ReadinessInput, "image_url" | "images">): boolean {
  if (typeof p.image_url === "string" && p.image_url.trim() !== "") return true;
  return (p.images ?? []).some((u) => typeof u === "string" && u.trim() !== "");
}

export function evaluateReadiness(p: ReadinessInput): ReadinessResult {
  const price = toNumber(p.price);
  const stock = toNumber(p.stock);
  const weight = toNumber(p.weight_grams);
  const blocked = p.is_blocked === true;

  const items: ReadinessItem[] = [
    {
      key: "price",
      label: "Harga sudah diisi",
      ok: price !== null && price > 0,
      problem: "Harga belum diisi",
      fix: "product",
    },
    {
      key: "photo",
      label: "Minimal 1 foto",
      ok: hasPhoto(p),
      problem: "Belum ada foto",
      fix: "product",
    },
    {
      key: "stock",
      label: "Stok valid (0 atau lebih)",
      ok: stock !== null && Number.isInteger(stock) && stock >= 0,
      problem: "Stok tidak valid",
      fix: "product",
    },
    {
      key: "weight",
      label: "Berat sudah diisi (untuk ongkir)",
      ok: weight !== null && weight > 0,
      problem: "Berat belum diisi",
      fix: "product",
    },
    {
      key: "not_blocked",
      label: "Tidak diblokir",
      ok: !blocked,
      problem: p.blocked_reason
        ? `Produk terlarang dijual online (${p.blocked_reason})`
        : "Produk terlarang dijual online",
      fix: null,
    },
  ];

  const missing = items.filter((i) => !i.ok).map((i) => i.key);
  return {
    items,
    ready: missing.length === 0,
    missing,
    live: p.is_active === true && !blocked,
  };
}

export type PublishState = "live" | "ready" | "incomplete" | "blocked";

/** Status tombol "Tayangkan": hanya "ready" yang boleh ditekan. */
export function publishState(p: ReadinessInput): PublishState {
  const r = evaluateReadiness(p);
  if (p.is_blocked === true) return "blocked";
  if (r.live) return "live";
  return r.ready ? "ready" : "incomplete";
}

/**
 * Apakah pembeli bisa membeli produk ini di toko. Mencerminkan RLS toko (is_active, tidak diblokir)
 * dan kolom hasil is_purchasable (price > 0 dan stock > 0, migrasi 0003). Dipakai agar produk bermasalah
 * tidak pernah ditampilkan seolah bisa dibeli.
 */
export function isPurchasable(
  p: Pick<ReadinessInput, "is_active" | "is_blocked" | "price" | "stock">,
): boolean {
  if (p.is_active !== true || p.is_blocked === true) return false;
  const price = toNumber(p.price);
  const stock = toNumber(p.stock);
  return price !== null && price > 0 && stock !== null && stock > 0;
}

export function readinessSummary(r: ReadinessResult): string {
  if (r.live) return "Produk sudah tayang.";
  if (r.ready) return "Semua syarat terpenuhi. Siap ditayangkan.";
  const first = r.items.filter((i) => !i.ok).map((i) => i.problem);
  return `Belum siap: ${first.join(", ").toLowerCase()}.`;
}
