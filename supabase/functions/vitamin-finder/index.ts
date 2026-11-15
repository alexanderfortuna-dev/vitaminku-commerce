// Edge Function `vitamin-finder` (Deno) — hanya glue: CORS, parse, batas laju, ambil produk, panggil core.
// Rahasia: ANTHROPIC_API_KEY (Edge secret). SUPABASE_URL & SUPABASE_ANON_KEY disediakan platform.
// Pembacaan produk tetap kunci anon supaya RLS (aktif & tidak diblokir) berlaku.
// chat_rate_hit boleh memakai service_role, hanya untuk RPC batas laju itu.
import {
  AGENT_ID,
  RATE_LIMIT,
  RATE_WINDOW_MINUTES,
  cleanQuery,
  fallbackOutput,
  invalidInputOutput,
  makeAnthropicCaller,
  makeIdempotencyKey,
  rateLimitedOutput,
  runFinder,
  validateInput,
  finderClientIp,
  visitorHash,
  type FinderOutput,
  type SearchArgs,
} from "../_shared/vitamin-finder-core.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const MAX_BODY_BYTES = 20_000;
const COLUMNS = "id,name,brand,price,size,image_url,slug"; // hanya kolom yang diizinkan

function json(body: FinderOutput, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
}

function restHeaders(anon: string): Record<string, string> {
  return { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/json" };
}

/** Batas laju via RPC chat_rate_hit. Gagal-tertutup: tanpa IP tepercaya atau RPC error = ditolak. */
async function rateAllowed(req: Request, base: string, anon: string): Promise<boolean> {
  try {
    const trust = String(Deno.env.get("TRUST_CLOUDFLARE_IP") ?? "").trim().toLowerCase() === "true";
    const ip = finderClientIp(req.headers, trust);
    const ua = ip === "unknown" ? "" : (req.headers.get("user-agent") ?? "");
    const visitor = await visitorHash(ip, ua);
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const keys = service ? [service, anon] : [anon];
    let lastStatus = 0;
    for (const key of keys) {
      const res = await fetch(`${base}/rest/v1/rpc/chat_rate_hit`, {
        method: "POST",
        headers: restHeaders(key),
        body: JSON.stringify({ _visitor: visitor, _limit: RATE_LIMIT, _window_minutes: RATE_WINDOW_MINUTES }),
      });
      if (res.ok) return (await res.json()) === true;
      lastStatus = res.status;
      // Sebelum migrasi 0019, service_role belum di-grant: coba kunci anon sekali.
      if (res.status !== 401 && res.status !== 403) break;
    }
    console.error("vitamin-finder rate limit rpc", lastStatus);
    return false;
  } catch (e) {
    console.error("vitamin-finder rate limit failed", e instanceof Error ? e.message : "unknown");
    return false;
  }
}

/** search_products: baca saja, produk aktif & tidak diblokir & harga > 0, 7 kolom saja. */
async function queryProducts(base: string, anon: string, a: SearchArgs): Promise<unknown[]> {
  const run = async (terms: string[]): Promise<unknown[]> => {
    const p = new URLSearchParams();
    p.set("select", COLUMNS);
    p.set("is_active", "eq.true");
    p.set("is_blocked", "eq.false");
    p.set("is_purchasable", "eq.true"); // harga > 0 dan tersedia; angka stok tidak pernah dibaca
    p.append("price", "gt.0");
    if (a.max_price !== undefined) p.append("price", `lte.${a.max_price}`);
    const ands = terms.map((t) => `or(name.ilike.*${t}*,brand.ilike.*${t}*,category.ilike.*${t}*,subcategory.ilike.*${t}*)`);
    const cat = a.category ? cleanQuery(a.category) : "";
    if (cat) ands.push(`or(category.ilike.*${cat}*,subcategory.ilike.*${cat}*)`);
    if (ands.length) p.set("and", `(${ands.join(",")})`);
    p.set("order", a.max_price !== undefined ? "price.desc" : "price.asc");
    p.set("limit", "8");
    const res = await fetch(`${base}/rest/v1/products?${p.toString()}`, { headers: restHeaders(anon) });
    if (!res.ok) throw new Error(`products_http_${res.status}`);
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? rows : [];
  };
  const terms = cleanQuery(a.query)
    .split(" ")
    .filter((t) => t.length > 1)
    .slice(0, 3);
  const rows = await run(terms);
  if (rows.length === 0 && terms.length > 1) return run(terms.slice(0, 1));
  return rows;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(invalidInputOutput(["method must be POST"]), 405);

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json(invalidInputOutput(["body too large"]), 413);
    raw = JSON.parse(text);
  } catch {
    return json(invalidInputOutput(["body must be valid JSON"]), 400);
  }
  const input = validateInput(raw);
  if (!input.ok) return json(invalidInputOutput(input.errors), 400);

  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const key = makeIdempotencyKey(input.value.session_id, input.value.message, input.value.history.length);
  if (!base || !anon) {
    console.error(JSON.stringify({ agent: AGENT_ID, event: "missing_env", names: ["SUPABASE_URL", "SUPABASE_ANON_KEY"] }));
    return json(fallbackOutput(key, "server_not_configured"));
  }
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    // Pesan terlarang/medis tetap dijawab tanpa model oleh core; selain itu fallback WhatsApp.
    console.error(JSON.stringify({ agent: AGENT_ID, event: "missing_secret", name: "ANTHROPIC_API_KEY" }));
  }

  if (!(await rateAllowed(req, base, anon))) return json(rateLimitedOutput(key), 429);

  const out = await runFinder({
    input: input.value,
    searchProducts: (a) => queryProducts(base, anon, a),
    callModel: makeAnthropicCaller((url, init) => fetch(url, init), Deno.env.get("ANTHROPIC_API_KEY")),
  });
  return json(out);
});
