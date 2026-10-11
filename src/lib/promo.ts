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
