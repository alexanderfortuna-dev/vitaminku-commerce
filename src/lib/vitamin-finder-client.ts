// Klien browser untuk Edge Function `vitamin-finder`. Murni (fetch/storage diinjeksi) agar bisa diuji.
// Hanya kunci publishable yang dipakai di browser; kunci AI hanya ada di Edge secret.

/** Lebih lama dari batas AI server (6 dtk) + cadangan kata kunci, agar jawaban cadangan tidak terpotong browser. */
export const FINDER_TIMEOUT_MS = 12000;
export const FINDER_MAX_HISTORY = 10;

export interface FinderCard {
  id: string;
  name: string;
  brand: string;
  price: number;
  size: string | null;
  image: string | null;
  slug: string;
  /** Kolom Rilis 3 (opsional; server lama tidak mengirimnya). */
  reason?: string;
  goodFor?: string;
  notFor?: string;
  costPerServing?: number;
  servings?: number;
  dose?: string;
  form?: string;
  evidence?: { ingredient: string; range: string; source: string };
}
export interface FinderTurn {
  role: "user" | "assistant";
  content: string;
}
export interface FinderUiResult {
  reply: string;
  products: FinderCard[];
  needsHuman: boolean;
  /** true bila fungsi tidak terjangkau/timeout/respons rusak (UI menampilkan WhatsApp). */
  failed: boolean;
  quickReplies: string[];
  queryHash: string | null;
}

/** URL fungsi: VITE_VITAMIN_FINDER_URL, atau `${VITE_SUPABASE_URL}/functions/v1/vitamin-finder`; null bila tak tersedia. */
export function resolveFinderUrl(env: { finderUrl?: string | undefined; supabaseUrl?: string | undefined }): string | null {
  const direct = env.finderUrl?.trim();
  if (direct) return direct;
  const base = env.supabaseUrl?.trim().replace(/\/+$/, "");
  return base ? `${base}/functions/v1/vitamin-finder` : null;
}

export function getFinderSessionId(storage?: Pick<Storage, "getItem" | "setItem">): string {
  const k = "vk_finder_session";
  try {
    const s = storage ?? (typeof sessionStorage !== "undefined" ? sessionStorage : undefined);
    const existing = s?.getItem(k);
    if (existing) return existing;
    const id = randomId();
    s?.setItem(k, id);
    return id;
  } catch {
    return randomId();
  }
}

function randomId(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

const FAIL: FinderUiResult = {
  reply: "Maaf, Vita sedang tidak bisa menjawab. Silakan tanya admin cabang lewat WhatsApp.",
  products: [],
  needsHuman: true,
  failed: true,
  quickReplies: [],
  queryHash: null,
};

const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/** Ambil hanya field yang dikenal; produk tanpa harga > 0 atau slug dibuang. */
export function parseFinderResponse(data: unknown): FinderUiResult {
  const d = data as Record<string, unknown> | null;
  const r = d?.["result"] as Record<string, unknown> | undefined;
  if (typeof d !== "object" || d === null || typeof r !== "object" || r === null || typeof r["reply_text"] !== "string") return FAIL;
  const raw = Array.isArray(r["products"]) ? (r["products"] as unknown[]) : [];
  const products: FinderCard[] = [];
  for (const p of raw) {
    const o = p as Record<string, unknown> | null;
    if (!o || typeof o["id"] !== "string" || typeof o["name"] !== "string" || typeof o["slug"] !== "string") continue;
    if (typeof o["price"] !== "number" || !(o["price"] > 0)) continue;
    const card: FinderCard = {
      id: o["id"],
      name: o["name"],
      brand: typeof o["brand"] === "string" ? o["brand"] : "",
      price: o["price"],
      size: typeof o["size"] === "string" ? o["size"] : null,
      image: typeof o["image"] === "string" ? o["image"] : null,
      slug: o["slug"],
    };
    const extra = {
      reason: str(o["reason"], 220),
      goodFor: str(o["good_for"], 140),
      notFor: str(o["not_for"], 140),
      costPerServing: num(o["cost_per_serving"]),
      servings: num(o["servings"]),
      dose: str(o["dose"], 80),
      form: str(o["form"], 20),
    };
    for (const [k, v] of Object.entries(extra)) if (v !== undefined) (card as unknown as Record<string, unknown>)[k] = v;
    const ev = o["evidence"] as Record<string, unknown> | null | undefined;
    const ing = str(ev?.["ingredient"], 80);
    const range = str(ev?.["range"], 160);
    const source = str(ev?.["source"], 160);
    if (ing && range && source) card.evidence = { ingredient: ing, range, source };
    products.push(card);
    if (products.length >= 3) break;
  }
  const status = d["status"];
  const qr = Array.isArray(r["quick_replies"]) ? (r["quick_replies"] as unknown[]).map((c) => str(c, 30)).filter((c): c is string => !!c).slice(0, 4) : [];
  const qh = typeof r["query_hash"] === "string" && /^[0-9a-f]{8,64}$/.test(r["query_hash"]) ? r["query_hash"] : null;
  return {
    reply: r["reply_text"],
    products,
    needsHuman: d["needs_human"] === true || status === "error",
    failed: status === "error",
    quickReplies: qr,
    queryHash: qh,
  };
}

export async function askFinder(opts: {
  url: string;
  apiKey: string;
  sessionId: string;
  message: string;
  history: FinderTurn[];
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<FinderUiResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? FINDER_TIMEOUT_MS);
  try {
    const res = await (opts.fetchFn ?? fetch)(opts.url, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: opts.apiKey },
      body: JSON.stringify({ session_id: opts.sessionId, message: opts.message, history: opts.history.slice(-FINDER_MAX_HISTORY) }),
      signal: ctl.signal,
    });
    return parseFinderResponse(await res.json());
  } catch {
    return FAIL;
  } finally {
    clearTimeout(timer);
  }
}

/** Sinyal anonim "produk ini dipilih dari Vita" (untuk Wawasan Vita). Gagal diam-diam. */
export function sendFinderChosen(opts: { url: string; apiKey: string; productId: string; queryHash: string | null; fetchFn?: typeof fetch }): void {
  if (!opts.queryHash) return;
  try {
    void (opts.fetchFn ?? fetch)(opts.url, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: opts.apiKey },
      body: JSON.stringify({ event: "chosen", product_id: opts.productId, query_hash: opts.queryHash }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* abaikan */
  }
}
