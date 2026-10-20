// Vita (Vitamin Finder) di server Vercel (/api/vitamin-finder). Bentuk JSON sama dengan Rilis 2, ditambah kolom opsional.
// Tanpa ANTHROPIC_API_KEY: mode kata kunci (src/lib/vita/engine.ts). Dengan kunci: mode AI berbasis tool (src/lib/vita/ai.ts),
// jatuh ke mode kata kunci bila AI lambat/gagal. Katalog dibaca sebagai anon (RLS tetap berlaku) dengan kolom eksplisit — tanpa harga modal.
import { createClient } from "@supabase/supabase-js";
import {
  RATE_LIMIT,
  RATE_WINDOW_MINUTES,
  fallbackOutput,
  invalidInputOutput,
  makeIdempotencyKey,
  rateLimitedOutput,
  validateInput,
  visitorHash,
  type FinderInput,
  type FinderOutput,
} from "../../supabase/functions/_shared/vitamin-finder-core";
import { runVitaKeyword, type CatalogQuery, type VitaEvent, type VitaOutput } from "./vita/engine";
import { makeVitaAnthropicCaller, runVitaAi } from "./vita/ai";
import { normalizeText } from "./vita/taxonomy";
import type { CatalogRow } from "./vita/rank";

const MAX_BODY_BYTES = 20_000;
/** Kolom yang boleh dibaca Vita. JANGAN tambahkan kolom harga modal atau "*". stock hanya dipakai sebagai ada/tidak. */
export const VITA_COLUMNS = "id,name,brand,category,subcategory,size,servings,dose,flavor,price,stock,image_url,slug,pack_count,variant_group";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function anonClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } });
}
/** Hanya untuk MENULIS statistik anonim lewat RPC vita_log_event (tidak pernah untuk membaca katalog). */
function eventClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } });
}

type Anon = NonNullable<ReturnType<typeof anonClient>>;

async function rateAllowed(req: Request, db: Anon): Promise<boolean> {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip");
    if (!ip) return true;
    const visitor = await visitorHash(ip, req.headers.get("user-agent") ?? "");
    const { data, error } = await db.rpc("chat_rate_hit", { _visitor: visitor, _limit: RATE_LIMIT, _window_minutes: RATE_WINDOW_MINUTES });
    if (error) return true; // gagal-terbuka: error teknis tidak memblokir pelanggan
    return data !== false;
  } catch {
    return true;
  }
}

// ---------- Katalog ----------
interface DbRow extends Omit<CatalogRow, "in_stock" | "image" | "price"> {
  stock?: number | null;
  in_stock?: boolean | null;
  image_url: string | null;
  price: number | string;
}
function toRow(r: DbRow): CatalogRow | null {
  const price = Number(r.price);
  if (!r.id || !r.name || !r.slug || !(price > 0)) return null;
  return {
    id: r.id,
    name: r.name,
    brand: r.brand ?? "",
    category: r.category ?? null,
    subcategory: r.subcategory ?? null,
    size: r.size ?? null,
    servings: r.servings ?? null,
    dose: r.dose ?? null,
    flavor: r.flavor ?? null,
    price,
    in_stock: r.in_stock ?? (r.stock ?? 0) > 0,
    image: r.image_url ?? null,
    slug: r.slug,
    pack_count: r.pack_count ?? null,
    variant_group: r.variant_group ?? null,
  };
}

const quote = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
const safeKw = (k: string) => k.replace(/[%*,()"\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
let rpcMissingUntil = 0;

/** Pencarian katalog: RPC full-text + trigram (migrasi 0017) bila ada; bila belum terpasang, kueri ilike biasa. */
export async function searchCatalog(db: Anon, q: CatalogQuery): Promise<CatalogRow[]> {
  const keywords = q.keywords.map(safeKw).filter(Boolean);
  if (Date.now() > rpcMissingUntil) {
    const { data, error } = await db.rpc("vita_search", {
      p_terms: keywords,
      p_subcategories: q.subcategories,
      p_max_price: q.maxPrice,
      p_limit: q.limit,
    });
    if (!error && Array.isArray(data)) return (data as DbRow[]).map(toRow).filter((r): r is CatalogRow => r !== null);
    // Hanya "fungsi belum dipasang" yang mematikan RPC 10 menit; gangguan sesaat cukup memakai ilike untuk permintaan ini.
    if (error && (error.code === "PGRST202" || error.code === "42883")) rpcMissingUntil = Date.now() + 10 * 60_000;
  }
  const conds = [
    ...(q.subcategories.length ? [`subcategory.in.(${q.subcategories.map(quote).join(",")})`] : []),
    ...keywords.flatMap((k) => [`name.ilike.${quote(`*${k}*`)}`, `brand.ilike.${quote(`*${k}*`)}`]),
  ];
  if (!conds.length) return [];
  let query = db
    .from("products")
    .select(VITA_COLUMNS)
    .eq("is_active", true)
    .eq("is_blocked", false)
    .eq("is_purchasable", true)
    .gt("price", 0)
    .or(conds.join(","));
  if (q.maxPrice !== null) query = query.lte("price", q.maxPrice);
  const { data, error } = await query.order("id").limit(q.limit);
  if (error) throw new Error(`products_${error.code ?? "error"}`);
  return ((data ?? []) as unknown as DbRow[]).map(toRow).filter((r): r is CatalogRow => r !== null);
}

// ---------- Cache jawaban mode kata kunci (10 menit) ----------
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; out: VitaOutput }>();
export function cacheKey(input: FinderInput): string {
  const prev = input.history.filter((h) => h.role === "user").slice(-2).map((h) => normalizeText(h.content));
  return [...prev, normalizeText(input.message)].join(" | ");
}
export function cacheGet(k: string, now = Date.now()): VitaOutput | null {
  const hit = cache.get(k);
  if (!hit || now - hit.at > CACHE_TTL_MS) {
    cache.delete(k);
    return null;
  }
  return hit.out;
}
export function cacheSet(k: string, out: VitaOutput, now = Date.now()): void {
  if (out.status === "error" || out.status === "invalid_input") return;
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(k, { at: now, out });
}

// ---------- Statistik anonim ----------
async function logEvent(e: Partial<VitaEvent> & { event: "answer" | "chosen"; chosen_product_id?: string }): Promise<void> {
  const db = eventClient();
  if (!db) return;
  try {
    await Promise.race([
      db.rpc("vita_log_event", {
        p_event: e.event,
        p_query_hash: e.query_hash ?? "",
        p_query_text: e.query_text ?? null,
        p_detected_goal: e.detected_goal ?? null,
        p_zero_result: e.zero_result ?? false,
        p_chosen_product_id: e.chosen_product_id ?? null,
        p_mode: e.mode ?? null,
      }),
      new Promise((r) => setTimeout(r, 400)),
    ]);
  } catch {
    // statistik tidak boleh mengganggu pelanggan
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleVitaminFinder(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json(invalidInputOutput(["body too large"]), 413);
    raw = JSON.parse(text);
  } catch {
    return json(invalidInputOutput(["body must be valid JSON"]), 400);
  }

  // Sinyal pilihan pelanggan dari kartu Vita (tanpa data pribadi).
  const ev = raw as Record<string, unknown> | null;
  if (ev && ev["event"] === "chosen") {
    const pid = typeof ev["product_id"] === "string" && UUID.test(ev["product_id"]) ? ev["product_id"] : null;
    const qh = typeof ev["query_hash"] === "string" && /^[0-9a-f]{8,64}$/.test(ev["query_hash"]) ? ev["query_hash"] : null;
    if (!pid || !qh) return json({ ok: false }, 400);
    const adb = anonClient();
    if (!adb || !(await rateAllowed(req, adb))) return json({ ok: false }, 429);
    await logEvent({ event: "chosen", query_hash: qh, chosen_product_id: pid });
    return json({ ok: true });
  }

  const input = validateInput(raw);
  if (!input.ok) return json(invalidInputOutput(input.errors), 400);
  const key = makeIdempotencyKey(input.value.session_id, input.value.message, input.value.history.length);
  const db = anonClient();
  if (!db) return json(fallbackOutput(key, "server_not_configured"));
  if (!(await rateAllowed(req, db))) return json(rateLimitedOutput(key), 429);

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  const search = (q: CatalogQuery) => searchCatalog(db, q);
  const events: VitaEvent[] = [];
  const onEvent = (e: VitaEvent) => void events.push(e);
  let out: VitaOutput | FinderOutput;
  if (apiKey) {
    out = await runVitaAi(input.value, { search, onEvent, callModel: makeVitaAnthropicCaller((u, i) => fetch(u, i), apiKey) });
  } else {
    const ck = cacheKey(input.value);
    const hit = cacheGet(ck);
    if (hit) out = { ...hit, idempotency_key: key };
    else {
      out = await runVitaKeyword(input.value, { search, onEvent });
      cacheSet(ck, out as VitaOutput);
    }
  }
  // Statistik paralel & dibatasi 250 ms total (serverless bisa menghentikan kerja setelah respons dikirim).
  if (events.length) await Promise.race([Promise.all(events.map((e) => logEvent({ event: "answer", ...e }))), new Promise((r) => setTimeout(r, 250))]);
  return json(out);
}
