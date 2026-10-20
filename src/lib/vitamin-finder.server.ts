// Vitamin Finder di server Vercel (/api/vitamin-finder). Logika sama persis dengan Edge Function
// (supabase/functions/_shared/vitamin-finder-core.ts); hanya "lem"-nya yang berbeda (Node, supabase-js anon).
// Tanpa ANTHROPIC_API_KEY tetap merekomendasikan produk lewat mode tanpa AI (kata kunci katalog).
// JANGAN pakai service_role: RLS (aktif & tidak diblokir) harus tetap berlaku. Hanya 7 kolom publik yang dibaca.
import { createClient } from "@supabase/supabase-js";
import {
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
  visitorHash,
  type FinderOutput,
  type SearchArgs,
} from "../../supabase/functions/_shared/vitamin-finder-core";

const MAX_BODY_BYTES = 20_000;
const COLUMNS = "id,name,brand,price,size,image_url,slug"; // hanya kolom yang diizinkan

function json(body: FinderOutput, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function anonClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } });
}

type Anon = NonNullable<ReturnType<typeof anonClient>>;

async function rateAllowed(req: Request, db: Anon): Promise<boolean> {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip");
    if (!ip) return true;
    const visitor = await visitorHash(ip, req.headers.get("user-agent") ?? "");
    const { data, error } = await db.rpc("chat_rate_hit", {
      _visitor: visitor,
      _limit: RATE_LIMIT,
      _window_minutes: RATE_WINDOW_MINUTES,
    });
    if (error) return true; // gagal-terbuka: error teknis tidak memblokir pelanggan
    return data !== false;
  } catch {
    return true;
  }
}

async function queryProducts(db: Anon, a: SearchArgs): Promise<unknown[]> {
  const run = async (terms: string[]): Promise<unknown[]> => {
    let q = db
      .from("products")
      .select(COLUMNS)
      .eq("is_active", true)
      .eq("is_blocked", false)
      .eq("is_purchasable", true)
      .gt("price", 0);
    if (a.max_price !== undefined) q = q.lte("price", a.max_price);
    for (const t of terms) q = q.or(`name.ilike.*${t}*,brand.ilike.*${t}*,category.ilike.*${t}*,subcategory.ilike.*${t}*`);
    const cat = a.category ? cleanQuery(a.category) : "";
    if (cat) q = q.or(`category.ilike.*${cat}*,subcategory.ilike.*${cat}*`);
    const { data, error } = await q.order("price", { ascending: a.max_price === undefined }).limit(8);
    if (error) throw new Error(`products_${error.code ?? "error"}`);
    return data ?? [];
  };
  const words = cleanQuery(a.query).split(" ").filter(Boolean);
  // Frasa dengan huruf tunggal ("vitamin c", "vitamin d") dicari utuh, bukan per kata.
  const terms = words.some((w) => w.length === 1) ? [words.join(" ")] : words.filter((t) => t.length > 1).slice(0, 3);
  const rows = await run(terms);
  if (rows.length === 0 && terms.length > 1) return run(terms.slice(0, 1));
  return rows;
}

export async function handleVitaminFinder(req: Request): Promise<Response> {
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

  const key = makeIdempotencyKey(input.value.session_id, input.value.message, input.value.history.length);
  const db = anonClient();
  if (!db) return json(fallbackOutput(key, "server_not_configured"));
  if (!(await rateAllowed(req, db))) return json(rateLimitedOutput(key), 429);

  const out = await runFinder({
    input: input.value,
    searchProducts: (a) => queryProducts(db, a),
    callModel: makeAnthropicCaller((url, init) => fetch(url, init), process.env["ANTHROPIC_API_KEY"]),
  });
  return json(out);
}
