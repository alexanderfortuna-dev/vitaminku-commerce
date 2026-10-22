// Pure, browser-safe promo rules. The server re-applies these from database rows;
// the browser only ever sends a code.

export interface Promo {
  code: string;
  label: string;
  kind: string;
  value: number;
  brand: string | null;
  starts_at: string;
  ends_at: string;
  is_active?: boolean;
}

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Active when flagged and now is within [starts_at, ends_at] (both inclusive). */
export function isPromoRunning(p: Promo, now: Date = new Date()): boolean {
  if (p.is_active === false) return false;
  const t = now.getTime();
  return t >= new Date(p.starts_at).getTime() && t <= new Date(p.ends_at).getTime();
}

/** Brand match is case-insensitive and exact on the trimmed brand (like SQL ILIKE 'fitlife'). */
export function promoAppliesTo(p: Promo, brand: string | null | undefined): boolean {
  if (!p.brand) return true;
  return (brand ?? "").trim().toLowerCase() === p.brand.trim().toLowerCase();
}

/** Rupiah discount for one line: percent of the line total, rounded to the nearest rupiah. */
export function lineDiscount(lineTotal: number, p: Promo): number {
  if (p.kind !== "percent") return 0;
  const pct = Math.min(Math.max(Number(p.value) || 0, 0), 90);
  return Math.round((lineTotal * pct) / 100);
}

/** The first running promo that applies to this brand (for display badges). */
export function promoForBrand(promos: Promo[], brand: string | null | undefined, now = new Date()): Promo | null {
  return promos.find((p) => isPromoRunning(p, now) && promoAppliesTo(p, brand)) ?? null;
}

/** "1 Des" in WITA (Asia/Makassar). */
export function promoEndLabel(p: Promo): string {
  return new Date(p.ends_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Makassar" });
}

// ---------- Kode promo & spanduk di perangkat pelanggan (penyimpanan diinjeksi agar bisa diuji) ----------
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const ls = (s?: StorageLike | null): StorageLike | null => {
  try {
    return s ?? (typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    return null;
  }
};

export const PENDING_PROMO_KEY = "vitaminku-promo-code";
/** Kode yang dipilih di keranjang/spanduk, dipakai otomatis di checkout. Hanya kode; harga tetap dihitung server. */
export function readPendingPromo(storage?: StorageLike | null): string | null {
  try {
    const v = ls(storage)?.getItem(PENDING_PROMO_KEY);
    return v ? normalizePromoCode(v).slice(0, 32) || null : null;
  } catch {
    return null;
  }
}
export function writePendingPromo(code: string | null, storage?: StorageLike | null): void {
  try {
    const s = ls(storage);
    if (!s) return;
    if (code && normalizePromoCode(code)) s.setItem(PENDING_PROMO_KEY, normalizePromoCode(code).slice(0, 32));
    else s.removeItem(PENDING_PROMO_KEY);
  } catch {
    /* abaikan */
  }
}

export const PROMO_DISMISS_KEY = "vitaminku-promo-dismissed";
export const PROMO_DISMISS_MS = 24 * 60 * 60 * 1000;
function readDismissed(storage?: StorageLike | null): Record<string, number> {
  try {
    const v = JSON.parse(ls(storage)?.getItem(PROMO_DISMISS_KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}
/** Spanduk promo yang ditutup pelanggan tidak muncul lagi selama 24 jam (per kode). */
export function isPromoDismissed(code: string, storage?: StorageLike | null, now = Date.now()): boolean {
  const at = readDismissed(storage)[normalizePromoCode(code)];
  return typeof at === "number" && now - at < PROMO_DISMISS_MS;
}
export function dismissPromo(code: string, storage?: StorageLike | null, now = Date.now()): void {
  try {
    const d = readDismissed(storage);
    for (const [k, at] of Object.entries(d)) if (typeof at !== "number" || now - at >= PROMO_DISMISS_MS) delete d[k];
    d[normalizePromoCode(code)] = now;
    ls(storage)?.setItem(PROMO_DISMISS_KEY, JSON.stringify(d));
  } catch {
    /* abaikan */
  }
}

/** Spanduk yang ditampilkan: promo berjalan pertama yang belum ditutup. */
export function pickBannerPromo(promos: Promo[], storage?: StorageLike | null, now = new Date()): Promo | null {
  return promos.find((p) => isPromoRunning(p, now) && !isPromoDismissed(p.code, storage, now.getTime())) ?? null;
}

/** Teks spanduk, juga dipakai pratinjau di Seller Center. */
export function promoBannerText(p: Pick<Promo, "label" | "code" | "brand" | "ends_at">): string {
  const scope = p.brand ? ` untuk ${p.brand}` : "";
  return `${p.label || "Promo"}${scope} · kode ${normalizePromoCode(p.code)} · s.d. ${promoEndLabel({ ends_at: p.ends_at } as Promo)}`;
}
