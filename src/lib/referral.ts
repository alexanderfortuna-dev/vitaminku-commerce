// Affiliate scaffold: remembers ?ref=CODE on this device for 30 days. No payouts.
const KEY = "vitaminku-ref";
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function cleanReferral(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{2,32}$/.test(v) ? v : null;
}

export function captureReferral(search: string, now = Date.now()) {
  try {
    const code = cleanReferral(new URLSearchParams(search).get("ref"));
    if (code) localStorage.setItem(KEY, JSON.stringify({ code, at: now }));
  } catch {
    /* storage unavailable */
  }
}

export function readReferral(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    if (now - at > REFERRAL_TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return cleanReferral(code);
  } catch {
    return null;
  }
}
