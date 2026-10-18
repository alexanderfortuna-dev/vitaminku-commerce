import { OFFICIAL_WHATSAPP_MAIN } from "./official-contacts";
// Pure checkout helpers (no I/O) shared by server code and tests.
import { createHash } from "node:crypto";

export type OrderStatus = "pending" | "menunggu_konfirmasi" | "paid" | "expired" | "cancelled";

export const DEFAULT_ORIGIN_POSTAL_CODE = "80228";
/** Products have no weight column yet; Biteship needs one. Assumed per unit. */
export const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

export interface CheckoutEnv {
  MIDTRANS_SERVER_KEY?: string | undefined;
  MIDTRANS_CLIENT_KEY?: string | undefined;
  MIDTRANS_IS_PRODUCTION?: string | undefined;
  BITESHIP_API_KEY?: string | undefined;
}

export interface CheckoutModes {
  isProduction: boolean;
  /** midtrans = Snap available (WhatsApp stays as secondary); whatsapp = WhatsApp order only. */
  payment: "midtrans" | "whatsapp";
  /** manual = no Biteship key, shipping cost confirmed by staff over WhatsApp. */
  shipping: "biteship" | "manual";
}

/** No simulated payment exists: without a Midtrans key, orders go through WhatsApp. */
export function resolveModes(env: CheckoutEnv): CheckoutModes {
  const isProduction = String(env.MIDTRANS_IS_PRODUCTION ?? "").trim().toLowerCase() === "true";
  return {
    isProduction,
    payment: env.MIDTRANS_SERVER_KEY?.trim() ? "midtrans" : "whatsapp",
    shipping: env.BITESHIP_API_KEY?.trim() ? "biteship" : "manual",
  };
}

export function midtransSignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string) {
  return createHash("sha512").update(orderId + statusCode + grossAmount + serverKey).digest("hex");
}

export function verifyMidtransSignature(
  n: { order_id?: unknown; status_code?: unknown; gross_amount?: unknown; signature_key?: unknown },
  serverKey: string,
): boolean {
  if ([n.order_id, n.status_code, n.gross_amount, n.signature_key].some((v) => typeof v !== "string")) return false;
  const expected = midtransSignature(
    n.order_id as string,
    n.status_code as string,
    n.gross_amount as string,
    serverKey,
  );
  const got = n.signature_key as string;
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Midtrans transaction_status (+fraud_status) → our order status. null = ignore. */
export function mapMidtransStatus(transactionStatus: string, fraudStatus?: string | null): OrderStatus | null {
  switch (transactionStatus) {
    case "settlement":
      return "paid";
    case "capture":
      return fraudStatus === "accept" || !fraudStatus ? "paid" : "pending";
    case "pending":
      return "pending";
    case "expire":
      return "expired";
    case "cancel":
    case "deny":
    case "failure":
      return "cancelled";
    default:
      return null;
  }
}

export function normalizeWhatsapp(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (d.startsWith("8")) d = "62" + d;
  return /^628\d{7,12}$/.test(d) ? d : null;
}

export function makeOrderNumber(now: Date, random: string): string {
  const y = String(now.getUTCFullYear()).slice(2);
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `VK-${y}${m}${d}-${random.toUpperCase()}`;
}

// ---- Tujuan WhatsApp pesanan ----
export const FALLBACK_WHATSAPP = OFFICIAL_WHATSAPP_MAIN;

export interface BranchContact {
  branch_id: string;
  role: string;
  whatsapp: string;
}

const ADMIN_WA = /^62\d{8,13}$/;

export interface WhatsappDestination {
  whatsapp: string;
  source: "ref_admin" | "branch_utama" | "branch" | "fallback";
  /** Admin aktif lain di cabang yang sama (utama dulu, lalu cadangan), tanpa nomor tujuan. */
  others: Array<{ role: string; whatsapp: string }>;
}

/** Admin aktif lain di cabang (utama dulu, lalu cadangan), selain nomor yang sudah dipakai. */
export function otherAdmins(
  contacts: BranchContact[],
  branchId: string | null,
  currentWhatsapp: string | null,
): Array<{ role: string; whatsapp: string }> {
  if (!branchId) return [];
  const seen = new Set<string>(currentWhatsapp ? [currentWhatsapp] : []);
  const out: Array<{ role: string; whatsapp: string }> = [];
  for (const c of [...contacts].sort((a, b) => Number(b.role === "utama") - Number(a.role === "utama"))) {
    if (c.branch_id !== branchId || !ADMIN_WA.test(c.whatsapp) || seen.has(c.whatsapp)) continue;
    seen.add(c.whatsapp);
    out.push({ role: c.role, whatsapp: c.whatsapp });
  }
  return out;
}

/**
 * Memilih nomor WhatsApp tujuan pesanan.
 * 1) admin pemilik kode ?ref bila aktif di cabang pilihan; 2) admin 'utama' aktif cabang;
 * 3) nomor cabang (store_branches.whatsapp); 4) nomor utama toko. Nomor tidak pernah dikarang.
 */
export function pickWhatsappDestination(input: {
  branchId: string | null;
  branchWhatsapp: string | null;
  contacts: BranchContact[];
  refAdmin?: { branch_id: string; whatsapp: string } | null;
  fallback?: string;
}): WhatsappDestination {
  const fallback = input.fallback ?? FALLBACK_WHATSAPP;
  if (!input.branchId) return { whatsapp: fallback, source: "fallback", others: [] };
  const contacts = input.contacts.filter((c) => c.branch_id === input.branchId && ADMIN_WA.test(c.whatsapp));
  const base = input.branchWhatsapp || fallback;
  const rest = (without: string) => otherAdmins(contacts, input.branchId, without);
  const ref = input.refAdmin;
  if (ref && ref.branch_id === input.branchId && contacts.some((c) => c.whatsapp === ref.whatsapp)) {
    return { whatsapp: ref.whatsapp, source: "ref_admin", others: rest(ref.whatsapp) };
  }
  const utama = contacts.find((c) => c.role === "utama");
  if (utama) return { whatsapp: utama.whatsapp, source: "branch_utama", others: rest(utama.whatsapp) };
  return { whatsapp: base, source: "branch", others: rest(base) };
}

// ---- Batas laju pembuatan pesanan ----
export const ORDER_RATE_LIMIT = 20;
export const ORDER_RATE_WINDOW_MINUTES = 60;

export interface HeaderReader {
  get(name: string): string | null;
}

/** IP klien dari header proxy; null bila tidak diketahui (jangan membatasi semua orang sekaligus). */
export function clientIpFrom(h: HeaderReader): string | null {
  for (const name of ["cf-connecting-ip", "x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"]) {
    const v = h.get(name)?.split(",")[0]?.trim();
    if (v) return v;
  }
  return null;
}

/** Hash 64 hex (SHA-256) dari IP + user-agent, cocok untuk RPC chat_rate_hit. */
export async function orderVisitorHash(ip: string, userAgent: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`order:${ip}:${userAgent}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const ORDER_RATE_LIMIT_MESSAGE =
  "Terlalu banyak pesanan dari perangkat ini dalam 1 jam terakhir. Coba lagi nanti, atau hubungi admin lewat WhatsApp.";
