// Batas aktivasi lintas instance lewat chat_rate_hit. Gagal-tertutup.
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { assertActivationAllowed, type HeaderReader, type RateRpcResult } from "./activation-limit";

export function activationRequestHeaders(): HeaderReader {
  return {
    get(name: string) {
      try {
        return getRequestHeader(name) ?? null;
      } catch {
        return null;
      }
    },
  };
}

export async function enforceActivationLimit(kind: "owner" | "staff"): Promise<void> {
  await assertActivationAllowed({ kind, headers: activationRequestHeaders(), rpc: callChatRateHit });
}

/** service_role dulu. Sebelum migrasi yang mencabut grant anon, kunci anon tetap membatasi. */
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
