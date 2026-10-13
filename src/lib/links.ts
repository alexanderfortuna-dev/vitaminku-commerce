// Pembuat tautan cabang / admin dan kode referral. Murni (tanpa browser/server) agar mudah diuji.
// Format tautan harus sama dengan yang dibaca halaman pelanggan: ?cabang=KODE dan ?ref=KODE.

export const BRANCH_CODE_RE = /^[A-Z0-9_-]{2,24}$/;
export const REFERRAL_CODE_RE = /^[A-Z0-9_-]{2,32}$/;

/** Rapikan kode cabang (huruf besar, tanpa spasi tepi). null bila bentuknya tidak sah. */
export function cleanBranchCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return BRANCH_CODE_RE.test(v) ? v : null;
}

function trimOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

/** `{origin}/?cabang={KODE}`; null bila cabang belum punya kode yang sah. */
export function branchLink(origin: string, code: string | null | undefined): string | null {
  const c = cleanBranchCode(code);
  return c ? `${trimOrigin(origin)}/?cabang=${encodeURIComponent(c)}` : null;
}

/** `{origin}/?ref={KODE}`; null bila admin belum punya kode referral yang sah. */
export function adminLink(origin: string, referral: string | null | undefined): string | null {
  const r = (referral ?? "").trim().toUpperCase();
  return REFERRAL_CODE_RE.test(r) ? `${trimOrigin(origin)}/?ref=${encodeURIComponent(r)}` : null;
}

/** Tautan gabungan `{origin}/?cabang=..&ref=..`; null bila salah satu kode tidak sah. */
export function combinedLink(origin: string, code: string | null | undefined, referral: string | null | undefined): string | null {
  const c = cleanBranchCode(code);
  const r = (referral ?? "").trim().toUpperCase();
  if (!c || !REFERRAL_CODE_RE.test(r)) return null;
  return `${trimOrigin(origin)}/?cabang=${encodeURIComponent(c)}&ref=${encodeURIComponent(r)}`;
}

/** Nama file QR yang aman, mis. "qr-cabang-SANUR.png". */
export function qrFileName(kind: "cabang" | "ref" | "gabungan", code: string): string {
  return `qr-${kind}-${code.replace(/[^A-Za-z0-9_-]/g, "")}.png`;
}

function firstNameToken(name: string): string {
  const word = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .find((w) => w.length > 0);
  return word ?? "ADMIN";
}

/**
 * Kode referral otomatis: KODECABANG-NAMA (kata pertama nama admin). Unik terhadap `taken`
 * (huruf besar); bila bentrok ditambah -2, -3, dst. Selalu lolos ^[A-Z0-9_-]{2,32}$.
 * Pemanggil wajib menambahkan hasilnya ke `taken` bila membuat beberapa kode sekaligus.
 */
export function makeReferralCode(branchCode: string, adminName: string, taken: ReadonlySet<string>): string {
  const code = (branchCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "") || "CAB").slice(0, 20);
  const rest = 32 - code.length - 1;
  const name = firstNameToken(adminName).slice(0, Math.max(2, rest));
  const base = `${code}-${name}`.slice(0, 32);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const cand = base.slice(0, 32 - suffix.length) + suffix;
    if (!taken.has(cand)) return cand;
  }
  throw new Error("Tidak bisa membuat kode referral unik.");
}
