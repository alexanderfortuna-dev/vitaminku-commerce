// Batas percobaan aktivasi owner/staf. Murni: RPC disuntikkan supaya bisa diuji tanpa database.
export const ACTIVATION_ATTEMPT_LIMIT = 20;
export const ACTIVATION_WINDOW_MINUTES = 15;
export const ACTIVATION_LOCKED_MESSAGE = "Terlalu banyak percobaan. Coba lagi dalam 15 menit.";
export const ACTIVATION_MISMATCH_MESSAGE = "Email atau kode aktivasi tidak cocok.";
export const ACTIVATION_UNAVAILABLE_MESSAGE = "Pembatasan aktivasi sedang bermasalah. Coba lagi sebentar.";
export const BOOTSTRAP_SECRET_MIN = 16;
export const BOOTSTRAP_SECRET_MISSING = "Aktivasi owner tidak tersedia.";
export const BOOTSTRAP_SECRET_TOO_SHORT =
  "Kode aktivasi server terlalu pendek. Minta owner mengatur ulang (minimal 16 karakter).";

export const UNKNOWN_IP_BUCKET = "unknown";

export interface HeaderReader {
  get(name: string): string | null;
}

export interface RateRpcResult {
  allowed: boolean | null;
  error: string | null;
}

/** cf-connecting-ip hanya dipercaya bila TRUST_CLOUDFLARE_IP=true. Di Vercel header itu bisa dipalsukan. */
export function trustCloudflareIp(env?: { TRUST_CLOUDFLARE_IP?: string | undefined }): boolean {
  const raw = env ? env.TRUST_CLOUDFLARE_IP : typeof process !== "undefined" ? process.env["TRUST_CLOUDFLARE_IP"] : undefined;
  return String(raw ?? "").trim().toLowerCase() === "true";
}

export function activationClientIp(h: HeaderReader | null, env?: { TRUST_CLOUDFLARE_IP?: string | undefined }): string {
  if (!h) return UNKNOWN_IP_BUCKET;
  const names = trustCloudflareIp(env)
    ? ["cf-connecting-ip", "x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"]
    : ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"];
  for (const name of names) {
    const v = h.get(name)?.split(",")[0]?.trim();
    if (v) return v;
  }
  return UNKNOWN_IP_BUCKET;
}

/** Hash 64 hex per IP + jenis aktivasi (owner atau staf), cocok untuk chat_rate_hit. */
export async function activationVisitorHash(kind: "owner" | "staff", ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`activate-${kind}:${ip}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gagal-tertutup: RPC error atau batas tercapai menolak percobaan. Tidak membandingkan kode. */
export async function assertActivationAllowed(opts: {
  kind: "owner" | "staff";
  headers: HeaderReader | null;
  rpc: (visitor: string, limit: number, windowMinutes: number) => Promise<RateRpcResult>;
  env?: { TRUST_CLOUDFLARE_IP?: string | undefined };
}): Promise<void> {
  const ip = activationClientIp(opts.headers, opts.env);
  const visitor = await activationVisitorHash(opts.kind, ip);
  let allowed: boolean | null = null;
  let error: string | null = null;
  try {
    const res = await opts.rpc(visitor, ACTIVATION_ATTEMPT_LIMIT, ACTIVATION_WINDOW_MINUTES);
    allowed = res.allowed;
    error = res.error;
  } catch (e) {
    error = e instanceof Error ? e.message : "unknown";
  }
  if (error) {
    console.error("activation rate limit", opts.kind, error);
    throw new Error(ACTIVATION_UNAVAILABLE_MESSAGE);
  }
  if (allowed !== true) throw new Error(ACTIVATION_LOCKED_MESSAGE);
}

export function assertBootstrapSecret(secret: string | undefined): string {
  if (!secret) throw new Error(BOOTSTRAP_SECRET_MISSING);
  if (secret.length < BOOTSTRAP_SECRET_MIN) throw new Error(BOOTSTRAP_SECRET_TOO_SHORT);
  return secret;
}

/** Satu pesan untuk email salah, kode salah, atau keduanya. Tidak menyebut bagian mana yang cocok. */
export function rejectMismatchedBootstrap(emailOk: boolean, codeOk: boolean): void {
  if (!emailOk || !codeOk) throw new Error(ACTIVATION_MISMATCH_MESSAGE);
}
