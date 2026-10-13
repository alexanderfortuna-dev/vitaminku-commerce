// Sanitasi laporan galat sebelum disimpan ke admin_audit_log. Murni (tanpa I/O).
// Tujuan: cukup untuk melacak masalah, tanpa data pribadi/rahasia (email, telepon, token, query URL, kunci API).

export type ErrorSource = "client" | "server";

export interface ErrorReport {
  source: ErrorSource;
  message: string;
  stack: string | null;
  /** Hanya path halaman (tanpa domain, query, atau hash). */
  path: string | null;
  kind: string | null;
}

export const ERROR_LIMITS = { message: 300, stack: 1200, stackLines: 8, line: 200, path: 120, kind: 30, body: 8192 } as const;

const KINDS = new Set(["error", "unhandledrejection", "boundary", "ssr", "middleware"]);

const RULES: Array<[RegExp, string]> = [
  // JWT & token Bearer
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, "[token]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]"],
  // email
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // query string / hash pada URL
  [/(https?:\/\/[^\s?#)"'<>]+)[?#][^\s)"'<>]*/g, "$1"],
  // pasangan kunci=nilai yang berbau rahasia
  [/\b(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|pwd|authorization|signature|sig|key)\b\s*[=:]\s*["']?[^\s,;&"'}]+/gi, "$1=[redacted]"],
  // kunci berawalan dikenal
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]+/g, "[token]"],
  [/\bsb_[A-Za-z0-9_-]{10,}/g, "[token]"],
  // nomor telepon Indonesia (+62 / 62 / 08xx) dengan spasi atau strip
  [/(?:\+?62|\b0)[\s-]?8\d{1,3}[\s-]?\d{3,4}[\s-]?\d{2,5}\b/g, "[telepon]"],
  // token heksadesimal / acak panjang (token pesanan 48 heks, hash, kunci)
  [/\b[a-fA-F0-9]{32,}\b/g, "[token]"],
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[token]"],
  // deretan angka panjang (nomor kartu/rekening/telepon tanpa pola)
  [/\b\d{10,}\b/g, "[angka]"],
];

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Menghapus data pribadi/rahasia dari teks bebas. */
export function redact(text: string): string {
  let out = text.replace(CONTROL, " ");
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Ambil hanya path dari URL/path; buang domain, query, hash, dan segmen yang berupa token. */
export function sanitizePath(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  let path = input.trim();
  const m = path.match(/^https?:\/\/[^/]+(\/[^?#]*)?/i);
  if (m) path = m[1] ?? "/";
  path = path.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/")) return null;
  path = path
    .split("/")
    .map((seg) => (/^[A-Za-z0-9_-]{24,}$/.test(seg) ? "[token]" : seg))
    .join("/");
  return clip(redact(path), ERROR_LIMITS.path);
}

function cleanStack(stack: string): string | null {
  const lines = redact(stack)
    .split(/\r?\n/)
    .map((l) => clip(l.trim(), ERROR_LIMITS.line))
    .filter(Boolean)
    .slice(0, ERROR_LIMITS.stackLines);
  return lines.length ? clip(lines.join("\n"), ERROR_LIMITS.stack) : null;
}

/** Tidak mengirim laporan untuk galat bising yang tidak bisa ditindaklanjuti. */
export function shouldIgnoreClientError(message: string): boolean {
  return (
    !message.trim() ||
    /^script error\.?$/i.test(message.trim()) ||
    /ResizeObserver loop/i.test(message) ||
    /extension:\/\/|chrome-extension|moz-extension/i.test(message)
  );
}

/**
 * Validasi + sanitasi masukan tak tepercaya (body endpoint). Mengembalikan null bila tidak ada pesan yang berguna.
 * Hanya kolom yang dikenal yang dibaca; kolom lain diabaikan.
 */
export function sanitizeErrorReport(input: unknown, source: ErrorSource): ErrorReport | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const rawMessage = typeof o["message"] === "string" ? o["message"] : "";
  const message = clip(redact(rawMessage).replace(/\s+/g, " ").trim(), ERROR_LIMITS.message);
  if (!message) return null;
  const stack = typeof o["stack"] === "string" ? cleanStack(o["stack"]) : null;
  const kind = typeof o["kind"] === "string" && KINDS.has(o["kind"]) ? o["kind"] : null;
  return { source, message, stack, path: sanitizePath(o["url"] ?? o["path"]), kind };
}

/** Dari hasil describeError() (error-capture.ts): baris pertama = pesan, sisanya = stack. */
export function reportFromDescription(description: string, kind: string | null = null): ErrorReport | null {
  const [first = "", ...rest] = description.split(/\r?\n/);
  return sanitizeErrorReport({ message: first, stack: rest.join("\n"), kind }, "server");
}

/** Bentuk yang ditulis ke kolom payload admin_audit_log. */
export function auditPayload(r: ErrorReport): Record<string, string | null> {
  return { message: r.message, stack: r.stack, path: r.path, kind: r.kind };
}

export const auditActionFor = (source: ErrorSource) => (source === "client" ? "client_error" : "server_error");
