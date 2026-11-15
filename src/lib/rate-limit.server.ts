// Batas laju server. Gagal-tertutup: RPC error atau IP tidak terbaca tidak membuka celah.
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import {
  ORDER_RATE_LIMIT,
  ORDER_RATE_LIMIT_MESSAGE,
  ORDER_RATE_WINDOW_MINUTES,
  purposeVisitorHash,
  rateLimitSubject,
  type HeaderReader,
} from "./checkout-core";

export const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  "Pembatasan permintaan sedang bermasalah. Coba lagi sebentar.";

export const SHIPPING_LOOKUP_LIMIT = 30;
export const SHIPPING_LOOKUP_WINDOW_MINUTES = 10;
export const SHIPPING_LOOKUP_LIMIT_MESSAGE =
  "Terlalu banyak permintaan ongkir. Coba lagi sebentar.";

export interface RateRpcResult {
  allowed: boolean | null;
  error: string | null;
}

export async function enforcePurposeLimit(opts: {
  purpose: string;
  limit: number;
  windowMinutes: number;
  deniedMessage: string;
  headers?: HeaderReader | null;
  rpc?: (visitor: string, limit: number, windowMinutes: number) => Promise<RateRpcResult>;
}): Promise<void> {
  const headers = opts.headers === undefined ? (getRequest()?.headers ?? null) : opts.headers;
  const { ip, userAgent } = rateLimitSubject(headers);
  const visitor = await purposeVisitorHash(opts.purpose, ip, userAgent);
  const rpc = opts.rpc ?? callChatRateHit;
  let allowed: boolean | null = null;
  let error: string | null = null;
  try {
    const res = await rpc(visitor, opts.limit, opts.windowMinutes);
    allowed = res.allowed;
    error = res.error;
  } catch (e) {
    error = e instanceof Error ? e.message : "unknown";
  }
  if (error) {
    console.error("rate limit", opts.purpose, error);
    throw new Error(RATE_LIMIT_UNAVAILABLE_MESSAGE);
  }
  if (allowed !== true) throw new Error(opts.deniedMessage);
}

export function enforceOrderRateLimit(
  headers?: HeaderReader | null,
  rpc?: (visitor: string, limit: number, windowMinutes: number) => Promise<RateRpcResult>,
): Promise<void> {
  return enforcePurposeLimit({
    purpose: "order",
    limit: ORDER_RATE_LIMIT,
    windowMinutes: ORDER_RATE_WINDOW_MINUTES,
    deniedMessage: ORDER_RATE_LIMIT_MESSAGE,
    ...(headers !== undefined ? { headers } : {}),
    ...(rpc ? { rpc } : {}),
  });
}

export function enforceShippingLookupLimit(
  purpose: "ship-area" | "ship-rate",
  headers?: HeaderReader | null,
): Promise<void> {
  return enforcePurposeLimit({
    purpose,
    limit: SHIPPING_LOOKUP_LIMIT,
    windowMinutes: SHIPPING_LOOKUP_WINDOW_MINUTES,
    deniedMessage: SHIPPING_LOOKUP_LIMIT_MESSAGE,
    ...(headers !== undefined ? { headers } : {}),
  });
}

/** service_role dulu. Sebelum migrasi 0019 terpasang, kunci anon masih boleh dan tetap membatasi. */
async function callChatRateHit(visitor: string, limit: number, windowMinutes: number): Promise<RateRpcResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const first = await supabaseAdmin.rpc("chat_rate_hit", {
    _visitor: visitor,
    _limit: limit,
    _window_minutes: windowMinutes,
  });
  if (!first.error) return { allowed: first.data === true, error: null };
  if (!/42501|permission denied/i.test(first.error.message)) {
    return { allowed: null, error: first.error.message };
  }
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return { allowed: null, error: first.error.message };
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
  const second = await anon.rpc("chat_rate_hit", {
    _visitor: visitor,
    _limit: limit,
    _window_minutes: windowMinutes,
  });
  if (second.error) return { allowed: null, error: second.error.message };
  return { allowed: second.data === true, error: null };
}
