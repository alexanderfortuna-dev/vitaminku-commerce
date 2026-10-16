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

// ---- Tautan cabang: ?cabang=KODE (QR / link dari cabang) ----
// Disimpan sebagai pilihan-awal saja. Tidak pernah memilih cabang lewat lokasi, dan dihapus
// begitu pelanggan memilih cabang sendiri di checkout (pilihan eksplisit menang).
const BRANCH_KEY = "vitaminku-cabang";
export const BRANCH_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function cleanBranchCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{2,24}$/.test(v) ? v : null;
}

/** Membaca ?cabang= dan ?ref= dari query string. Nilai tidak valid menjadi null. */
export function parseLinkParams(search: string): { cabang: string | null; ref: string | null } {
  try {
    const q = new URLSearchParams(search);
    return { cabang: cleanBranchCode(q.get("cabang")), ref: cleanReferral(q.get("ref")) };
  } catch {
    return { cabang: null, ref: null };
  }
}

export function captureBranchCode(search: string, now = Date.now()) {
  try {
    const { cabang } = parseLinkParams(search);
    if (cabang) localStorage.setItem(BRANCH_KEY, JSON.stringify({ code: cabang, at: now }));
  } catch {
    /* storage unavailable */
  }
}

/** Dipanggil sekali di halaman mana pun pelanggan mendarat. */
export function captureLinkParams(search: string, now = Date.now()) {
  captureReferral(search, now);
  captureBranchCode(search, now);
}

export function readBranchCode(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(BRANCH_KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    if (now - at > BRANCH_LINK_TTL_MS) {
      localStorage.removeItem(BRANCH_KEY);
      return null;
    }
    return cleanBranchCode(code);
  } catch {
    return null;
  }
}

/** Pelanggan memilih cabang sendiri: tautan lama tidak boleh menimpanya lagi. */
export function clearBranchCode() {
  try {
    localStorage.removeItem(BRANCH_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Cabang aktif yang kodenya cocok (tanpa membedakan huruf besar/kecil); null bila tidak ada. */
export function matchBranchByCode<T extends { code: string | null; is_active?: boolean }>(
  branches: T[],
  code: string | null | undefined,
): T | null {
  const c = cleanBranchCode(code);
  if (!c) return null;
  return branches.find((b) => b.is_active !== false && b.code != null && b.code.toUpperCase() === c) ?? null;
}
