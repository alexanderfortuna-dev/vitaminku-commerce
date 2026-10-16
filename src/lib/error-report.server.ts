// Menyimpan galat klien/server ke admin_audit_log ('client_error' / 'server_error'), tanpa layanan berbayar.
// Dibatasi laju lewat RPC chat_rate_hit (per pengunjung + batas global) supaya endpoint publik tidak bisa dipakai membanjiri tabel.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { describeError } from "./error-capture";
import {
  ERROR_LIMITS,
  auditActionFor,
  auditPayload,
  reportFromDescription,
  sanitizeErrorReport,
  type ErrorReport,
} from "./error-payload";

const PER_VISITOR = { limit: 8, windowMinutes: 10 };
const GLOBAL = { limit: 120, windowMinutes: 10 };
const SERVER = { limit: 40, windowMinutes: 10 };

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function anonClient() {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function allowed(visitor: string, limit: number, windowMinutes: number): Promise<boolean> {
  // Gagal-tertutup: bila pembatas error/tidak terkonfigurasi, laporan dibuang (lebih baik hilang daripada membuka banjir).
  try {
    const { data, error } = await anonClient().rpc("chat_rate_hit", {
      _visitor: await sha256Hex(visitor),
      _limit: limit,
      _window_minutes: windowMinutes,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export type RecordResult = "saved" | "limited" | "failed";

async function insert(report: ErrorReport): Promise<RecordResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_audit_log")
      .insert({ user_id: null, action: auditActionFor(report.source), payload: auditPayload(report) as never });
    return error ? "failed" : "saved";
  } catch {
    return "failed";
  }
}

function visitorKey(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return `client-error:${ip}:${request.headers.get("user-agent") ?? ""}`;
}

/** Endpoint publik: validasi ukuran + bentuk, batasi laju, lalu simpan. */
export async function handleClientError(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return new Response(null, { status: 403 });
    } catch {
      return new Response(null, { status: 403 });
    }
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > ERROR_LIMITS.body) return new Response(null, { status: 413 });
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (raw.length > ERROR_LIMITS.body) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = sanitizeErrorReport(body, "client");
  if (!report) return new Response(null, { status: 400 });

  if (!(await allowed(visitorKey(request), PER_VISITOR.limit, PER_VISITOR.windowMinutes))) {
    return new Response(null, { status: 429 });
  }
  if (!(await allowed("client-error:global", GLOBAL.limit, GLOBAL.windowMinutes))) {
    return new Response(null, { status: 429 });
  }
  const result = await insert(report);
  return new Response(null, { status: result === "saved" ? 204 : 202 });
}

/** Galat server (SSR/middleware). Tidak pernah melempar; dipanggil tanpa await. */
export async function reportServerError(error: unknown, kind: string | null = "ssr"): Promise<RecordResult> {
  try {
    const report = reportFromDescription(describeError(error), kind);
    if (!report) return "failed";
    if (!(await allowed("server-error", SERVER.limit, SERVER.windowMinutes))) return "limited";
    return await insert(report);
  } catch {
    return "failed";
  }
}
