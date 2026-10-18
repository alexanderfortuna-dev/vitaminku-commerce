// Klien browser untuk Edge Function `vitamin-finder`. Murni (fetch/storage diinjeksi) agar bisa diuji.
// Hanya kunci publishable yang dipakai di browser; kunci AI hanya ada di Edge secret.

export const FINDER_TIMEOUT_MS = 8000;
export const FINDER_MAX_HISTORY = 10;

export interface FinderCard {
  id: string;
  name: string;
  brand: string;
  price: number;
  size: string | null;
  image: string | null;
  slug: string;
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
  reply: "Maaf, Vita sedang tidak bisa menjawab. Silakan chat admin lewat WhatsApp ya.",
  products: [],
  needsHuman: true,
  failed: true,
};

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
    products.push({
      id: o["id"],
      name: o["name"],
      brand: typeof o["brand"] === "string" ? o["brand"] : "",
      price: o["price"],
      size: typeof o["size"] === "string" ? o["size"] : null,
      image: typeof o["image"] === "string" ? o["image"] : null,
      slug: o["slug"],
    });
    if (products.length >= 3) break;
  }
  const status = d["status"];
  return {
    reply: r["reply_text"],
    products,
    needsHuman: d["needs_human"] === true || status === "error",
    failed: status === "error",
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
