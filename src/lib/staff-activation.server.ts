// Kode aktivasi akun staf (Manajer / Tim Produk). Tanpa tabel baru: kode = tanda tangan HMAC dari
// (email, peran, jabatan, tanggal kedaluwarsa) memakai rahasia server STAFF_ACTIVATION_SECRET.
// Sifat: terikat ke SATU email + SATU peran, kedaluwarsa otomatis, sekali pakai (akun yang sudah ada menolak
// pemakaian kedua), dan tidak ada kode yang tersimpan di repo atau database. Peran owner TIDAK bisa dibuat lewat kode.
import { createHmac, timingSafeEqual } from "node:crypto";

export type StaffRole = "admin" | "seller";
export type StaffTitle = "admin" | "general_manager";
export type StaffGrant = { role: StaffRole; title: StaffTitle | null };

export const STAFF_GRANTS: readonly StaffGrant[] = [
  { role: "admin", title: "admin" },
  { role: "admin", title: "general_manager" },
  { role: "seller", title: null },
];

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 huruf/angka, tanpa I, O, 0, 1 agar tidak salah baca
const TAG_CHARS = 20; // 20 x 5 bit = 100 bit
const MIN_SECRET_LENGTH = 24;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export type VerifyResult =
  | { ok: true; grant: StaffGrant; expiresOn: string }
  | { ok: false; reason: "invalid" | "expired" | "unavailable" };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Tanggal kedaluwarsa (YYYYMMDD, zona WIB) = hari ini WIB + sekian hari. */
export function expiryFromDays(days: number, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS + Math.round(days) * 24 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Akhir hari (23:59:59 WIB) dari tanggal YYYYMMDD, dalam milidetik UTC. */
function endOfDayWib(expiresOn: string): number {
  const y = Number(expiresOn.slice(0, 4));
  const m = Number(expiresOn.slice(4, 6));
  const d = Number(expiresOn.slice(6, 8));
  return Date.UTC(y, m - 1, d, 23, 59, 59) - WIB_OFFSET_MS;
}

function tagFor(secret: string, email: string, grant: StaffGrant, expiresOn: string): string {
  const mac = createHmac("sha256", secret)
    .update(`vk-staff-v1|${normalizeEmail(email)}|${grant.role}|${grant.title ?? "-"}|${expiresOn}`)
    .digest();
  let out = "";
  for (let i = 0; i < TAG_CHARS; i += 1) out += ALPHABET[mac[i]! % 32];
  return out;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Bentuk tampilan: VK-20261104-ABCDE-FGHJK-LMNPQ-RSTUV */
export function makeStaffCode(input: {
  secret: string;
  email: string;
  grant: StaffGrant;
  expiresOn: string;
}): string {
  if (input.secret.length < MIN_SECRET_LENGTH) throw new Error("Rahasia aktivasi staf terlalu pendek.");
  if (!/^\d{8}$/.test(input.expiresOn)) throw new Error("Tanggal kedaluwarsa harus YYYYMMDD.");
  const tag = tagFor(input.secret, input.email, input.grant, input.expiresOn);
  return `VK-${input.expiresOn}-${tag.match(/.{5}/g)!.join("-")}`;
}

export function verifyStaffCode(input: {
  secret: string | undefined;
  email: string;
  code: string;
  now?: Date | undefined;
}): VerifyResult {
  if (!input.secret || input.secret.length < MIN_SECRET_LENGTH) return { ok: false, reason: "unavailable" };
  const compact = input.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = /^VK(\d{8})([A-Z2-9]{20})$/.exec(compact);
  if (!match) return { ok: false, reason: "invalid" };
  const expiresOn = match[1]!;
  const given = match[2]!;
  // Semua kombinasi dicek tanpa berhenti lebih awal agar waktu respons tetap datar.
  let found: StaffGrant | null = null;
  for (const grant of STAFF_GRANTS) {
    if (safeEqual(given, tagFor(input.secret, input.email, grant, expiresOn)) && !found) found = grant;
  }
  if (!found) return { ok: false, reason: "invalid" };
  const now = (input.now ?? new Date()).getTime();
  if (now > endOfDayWib(expiresOn)) return { ok: false, reason: "expired" };
  return { ok: true, grant: found, expiresOn };
}

/** Satu-satunya tempat peran dari input owner diterjemahkan ke hak. Owner (atau apa pun selain dua peran) ditolak. */
export function grantFor(role: string, title?: string | null): StaffGrant {
  if (role === "admin") return { role: "admin", title: title === "general_manager" ? "general_manager" : "admin" };
  if (role === "seller") return { role: "seller", title: null };
  throw new Error("Peran tidak valid.");
}

/* ---------------------------- alur aktivasi akun ---------------------------- */

export class StaffActivationError extends Error {
  constructor(
    message: string,
    /** "code" = kode/email salah (dihitung ke pembatas percobaan); "other" = kegagalan lain. */
    readonly kind: "code" | "other",
  ) {
    super(message);
  }
}

/** Operasi database/auth yang disuntikkan, supaya alur bisa diuji tanpa Supabase. Nilai kembali: pesan galat atau null. */
export type StaffDeps = {
  createUser(email: string, password: string): Promise<{ id: string } | { exists: true } | { error: string }>;
  upsertRole(id: string, grant: StaffGrant, displayName: string | null): Promise<string | null>;
  deleteUser(id: string): Promise<string | null>;
  audit(id: string, grant: StaffGrant): Promise<string | null>;
  log(message: string): void;
};

export function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, 80) || null;
}

export async function runStaffActivation(
  deps: StaffDeps,
  input: { secret: string | undefined; email: string; password: string; code: string; displayName?: unknown; now?: Date | undefined },
): Promise<{ ok: true }> {
  const email = normalizeEmail(input.email);
  const displayName = cleanDisplayName(input.displayName); // dihitung SEBELUM akun dibuat

  const verdict = verifyStaffCode({ secret: input.secret, email, code: input.code, now: input.now });
  if (!verdict.ok) {
    if (verdict.reason === "unavailable") deps.log("STAFF_ACTIVATION_SECRET belum dipasang atau terlalu pendek");
    if (verdict.reason === "expired") {
      throw new StaffActivationError("Kode aktivasi sudah kedaluwarsa. Minta kode baru ke owner.", "code");
    }
    throw new StaffActivationError("Email atau kode aktivasi tidak cocok.", "code");
  }
  const grant = verdict.grant;

  const created = await deps.createUser(email, input.password);
  if ("exists" in created) {
    // Akun yang sudah ada (mis. akun pelanggan) TIDAK PERNAH disentuh: tidak ada reset kata sandi, tidak ada pemberian peran.
    throw new StaffActivationError(
      "Email ini sudah terdaftar sebagai akun lain. Minta owner membuat kode untuk email staf yang belum pernah dipakai di VitaminKu.",
      "other",
    );
  }
  if ("error" in created) {
    deps.log(`createUser gagal: ${created.error}`);
    throw new StaffActivationError("Gagal membuat akun. Coba lagi atau hubungi owner.", "other");
  }
  const userId = created.id;

  // Setiap langkah setelah akun terbuat dijaga: kegagalan APA PUN (dikembalikan maupun dilempar) membatalkan akun baru ini.
  const rollback = async (reason: string): Promise<never> => {
    deps.log(`${reason}; akun baru ${userId} dibatalkan`);
    let delError: string | null = null;
    try {
      delError = await deps.deleteUser(userId);
    } catch (e) {
      delError = e instanceof Error ? e.message : "tidak diketahui";
    }
    if (delError) {
      deps.log(`deleteUser (pembatalan) gagal untuk ${userId}: ${delError}`);
      throw new StaffActivationError("Akun terbuat tetapi peran gagal disimpan. Hubungi owner; sebutkan waktu kejadian.", "other");
    }
    throw new StaffActivationError("Gagal menyimpan peran staf. Coba lagi atau hubungi owner.", "other");
  };
  let roleError: string | null;
  try {
    roleError = await deps.upsertRole(userId, grant, displayName);
  } catch (e) {
    roleError = e instanceof Error ? e.message : "tidak diketahui";
  }
  if (roleError) return rollback(`upsertRole gagal: ${roleError}`);

  try {
    const auditError = await deps.audit(userId, grant);
    if (auditError) deps.log(`audit staff_activate gagal: ${auditError}`);
  } catch (e) {
    deps.log(`audit staff_activate melempar: ${e instanceof Error ? e.message : "tidak diketahui"}`);
  }
  return { ok: true };
}
