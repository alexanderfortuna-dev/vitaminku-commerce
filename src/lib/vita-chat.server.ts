// Server-only brain for the Vita shopping assistant. Catalog reads go through the
// anonymous client, so storefront RLS (active + not blocked) always applies; the
// tools additionally return only purchasable products.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  FORBIDDEN_REPLY,
  VITA_MAX_CARDS,
  VITA_MAX_CHARS,
  VITA_MAX_MESSAGES,
  VITA_RATE_LIMIT,
  VITA_RATE_WINDOW_MINUTES,
  extractOrderToken,
  isForbiddenRequest,
  normalizeOrderNumber,
  vitaWhatsappUrl,
} from "./vita-safety";
import { parseBudgetIdr, rankForBudget, wantsTrialSize } from "./vita-budget";

// Provider-agnostic. Prefers Claude (ANTHROPIC_API_KEY); otherwise any OpenAI-compatible endpoint
// (AI_API_KEY + optional AI_BASE_URL). Without a key Vita shows a polite "unavailable" message and the
// rest of the store keeps working. AI_MODEL overrides the default model of either provider.
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const UNAVAILABLE_REPLY =
  "Vita sedang tidak tersedia saat ini. Silakan chat admin via WhatsApp, ya — kami siap membantu.";

function resolveModel() {
  const model = process.env["AI_MODEL"];
  const claudeKey = process.env["ANTHROPIC_API_KEY"];
  if (claudeKey) return createAnthropic({ apiKey: claudeKey })(model || DEFAULT_CLAUDE_MODEL);
  const apiKey = process.env["AI_API_KEY"];
  if (apiKey) {
    const baseURL = process.env["AI_BASE_URL"] || DEFAULT_AI_BASE_URL;
    return createOpenAI({ baseURL, apiKey }).chat(model || DEFAULT_OPENAI_MODEL);
  }
  return null;
}
const CARD_COLUMNS =
  "id,sku,name,brand,category,subcategory,size,pack_count,servings,dose,flavor,price,compare_at_price,stock,image_url,bpom_number,slug";

const INSTRUCTIONS = `Kamu adalah Vita, asisten belanja VitaminKu (toko vitamin, suplemen, dan sports nutrition original di Indonesia).
Gaya: bahasa Indonesia, hangat, singkat (maksimal 3-4 kalimat), pakai "kamu".
Aturan wajib:
- Untuk mencari produk SELALU panggil search_products. Jangan pernah mengarang nama produk, harga, stok, nomor BPOM, atau ulasan; pakai hanya data dari tool. Kartu produk otomatis tampil di layar, jadi cukup sebut 1 kalimat alasan singkat, jangan ulangi daftar harga panjang.
- Jika budget disebut (misal "500 ribu"), isi max_price dalam rupiah (500000). Hasil berurutan: 1) paling worth it mendekati budget, 2) premium dalam budget, 3) alternatif lebih hemat — jelaskan singkat dengan urutan itu.
- Jangan sebut stok dalam angka; cukup "tersedia".
- Kamu bukan dokter. Jangan mendiagnosis, dan jangan pernah bilang suplemen "menyembuhkan", "mengobati", atau "mencegah penyakit" (aturan BPOM). Pakai kata seperti "membantu memenuhi kebutuhan" atau "mendukung".
- Jika pengunjung menyebut penyakit/kondisi medis, kehamilan/menyusui, anak-anak, atau sedang minum obat: WAJIB sarankan konsultasi dengan dokter atau apoteker sebelum mengonsumsi suplemen.
- Jangan pernah merekomendasikan obat keras, SARMs, modafinil, yohimbe/yohimbine, atau DHEA.
- "Cek pesanan": minta nomor pesanan (contoh VK-...), lalu panggil check_order. Jangan pernah menebak status atau menampilkan data pesanan orang lain.
- Jika kamu tidak yakin, tidak menemukan produk yang cocok, atau pengunjung ingin bicara dengan manusia/admin: panggil handoff_whatsapp dengan ringkasan singkat kebutuhannya.
- Nama produk di katalog umumnya berbahasa Inggris. Terjemahkan kebutuhan pengunjung ke kata kunci produk (contoh: susah tidur -> "melatonin" atau "magnesium"; menambah massa otot -> "gainer", "whey", "creatine"; energi sebelum latihan -> "pre-workout"; sendi -> "glucosamine"; kulit -> "collagen", "glutathione"). Boleh memanggil search_products 2-3 kali dengan kata kunci berbeda sebelum menyerah.
- Kebutuhan masih kabur? Tanyakan SATU hal singkat (tujuan atau budget); jangan beri daftar panjang.
- Saat membandingkan, sebut 2-3 pilihan dengan alasan berbeda (isi/servings, ukuran, kecocokan) lalu ajak pengunjung menambahkan ke keranjang.
- Promo: hanya sebut promo yang tampil di kartu produk; jangan menjanjikan diskon.
- Tolak topik di luar belanja suplemen dengan sopan.`;

function anonClient() {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function clean(input: string) {
  return input.replace(/[%_&|!():*'"\\<>=,.]/g, " ").replace(/\s+/g, " ").trim();
}

async function visitorHash(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const ua = request.headers.get("user-agent") ?? "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vita:${ip}:${ua}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function textOf(m: UIMessage) {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
}

function cannedReply(text: string, status = 200) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id: "canned" });
      writer.write({ type: "text-delta", id: "canned", delta: text });
      writer.write({ type: "text-end", id: "canned" });
    },
  });
  return createUIMessageStreamResponse({ stream, status });
}

const bodySchema = z.object({
  messages: z.array(z.any()).min(1),
  orderTokens: z.array(z.string().regex(/^[a-f0-9]{48}$/)).max(10).optional(),
});

export async function handleVitaChat(request: Request): Promise<Response> {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  const model = resolveModel();
  if (!model) return cannedReply(UNAVAILABLE_REPLY);
  const messages = body.messages as UIMessage[];
  if (messages.length > VITA_MAX_MESSAGES) {
    return cannedReply("Percakapan ini sudah panjang. Tap ikon ↻ di atas untuk mulai obrolan baru, ya.");
  }
  const last = messages[messages.length - 1]!;
  const lastText = last.role === "user" ? textOf(last) : "";
  if (lastText.length > VITA_MAX_CHARS) {
    return cannedReply(`Pesannya terlalu panjang. Coba ringkas di bawah ${VITA_MAX_CHARS} karakter, ya.`);
  }

  const supabase = anonClient();
  const { data: allowed, error: rlErr } = await supabase.rpc("chat_rate_hit", {
    _visitor: await visitorHash(request),
    _limit: VITA_RATE_LIMIT,
    _window_minutes: VITA_RATE_WINDOW_MINUTES,
  });
  if (rlErr) console.error("vita rate limit", rlErr.message);
  if (allowed === false) {
    return Response.json(
      { error: "Kamu sudah mengirim banyak pesan. Coba lagi dalam beberapa menit, atau chat admin via WhatsApp." },
      { status: 429 },
    );
  }

  // Server-side block: forbidden products never reach the model.
  if (isForbiddenRequest(lastText)) return cannedReply(FORBIDDEN_REPLY);

  const orderTokens = body.orderTokens ?? [];
  const pastedToken = extractOrderToken(lastText);
  if (pastedToken && !orderTokens.includes(pastedToken)) orderTokens.push(pastedToken);

  const tools = {
    search_products: tool({
      description:
        "Cari produk yang bisa dibeli sekarang (ada harga & stok) di katalog VitaminKu. Hasil teratas tampil sebagai kartu produk.",
      inputSchema: z.object({
        query: z.string().describe("Kata kunci singkat, mis. 'whey', 'vitamin c', 'magnesium', 'creatine'."),
        max_price: z.number().nullable().describe("Harga maksimum dalam rupiah, atau null."),
        min_price: z.number().nullable().describe("Harga minimum dalam rupiah, atau null."),
        sort: z.enum(["relevance", "price_asc", "price_desc"]).nullable(),
      }),
      execute: async ({ query, max_price, min_price, sort }) => {
        const q = clean(query).slice(0, 60);
        const budget = max_price ?? parseBudgetIdr(lastText);
        const allowTrial = wantsTrialSize(`${lastText} ${q}`);
        let req = supabase
          .from("products")
          .select(CARD_COLUMNS)
          .eq("is_active", true)
          .eq("is_blocked", false)
          .eq("is_purchasable", true);
        if (budget) req = req.lte("price", budget);
        if (min_price) req = req.gte("price", min_price);
        for (const term of q.split(" ").filter((t) => t.length > 1).slice(0, 4)) {
          const like = `%${term}%`;
          req = req.or(`name.ilike.${like},brand.ilike.${like},category.ilike.${like},subcategory.ilike.${like}`);
        }
        req = req.order("price", { ascending: !budget && sort === "price_asc" });
        const { data, error } = await req.limit(budget ? 80 : sort === "relevance" || !sort ? 12 : VITA_MAX_CARDS);
        if (error) return { error: "Katalog sedang tidak bisa dibaca.", products: [] };
        let rows = (data ?? []).filter((p) => !isForbiddenRequest(`${p.name} ${p.brand}`));
        if (budget) rows = rankForBudget(rows, budget, allowTrial);
        const products = rows.slice(0, VITA_MAX_CARDS).map((p) => ({ ...p, description: null }));
        return {
          total_found: rows.length,
          products,
          note: products.length ? undefined : "Tidak ada produk yang tersedia untuk kata kunci ini.",
        };
      },
    }),
    get_product: tool({
      description: "Detail satu produk (berdasarkan slug dari search_products), termasuk deskripsi dan BPOM.",
      inputSchema: z.object({ slug: z.string() }),
      execute: async ({ slug }) => {
        const { data } = await supabase
          .from("products")
          .select(`${CARD_COLUMNS},description,is_purchasable`)
          .eq("slug", slug)
          .eq("is_active", true)
          .eq("is_blocked", false)
          .maybeSingle();
        if (!data) return { error: "Produk tidak ditemukan." };
        const { stock: _s, ...rest } = data;
        return { ...rest, description: data.description?.slice(0, 1200) ?? null, available: data.is_purchasable };
      },
    }),
    check_order: tool({
      description:
        "Cek status pesanan berdasarkan nomor pesanan. Hanya pesanan yang dibuat dari perangkat ini atau yang tautannya ditempel bisa dibaca.",
      inputSchema: z.object({ order_number: z.string() }),
      execute: async ({ order_number }) => {
        const wanted = normalizeOrderNumber(order_number);
        for (const token of orderTokens) {
          // Token dari perangkat ini; fungsi ini hanya untuk server (service_role), jadi lewat klien admin.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.rpc("get_order_by_token", { _token: token });
          const o = data as { order_number?: string; status?: string; total?: number; created_at?: string } | null;
          if (o?.order_number && normalizeOrderNumber(o.order_number) === wanted) {
            return {
              found: true,
              order_number: o.order_number,
              status: o.status,
              total: o.total,
              created_at: o.created_at,
              order_url: `/pesanan/${token}`,
            };
          }
        }
        return {
          found: false,
          note: "Pesanan tidak ditemukan di perangkat ini. Minta pengunjung menempel tautan halaman pesanannya, atau hubungi admin via WhatsApp.",
        };
      },
    }),
    handoff_whatsapp: tool({
      description: "Tampilkan tombol 'Chat admin via WhatsApp' dengan ringkasan singkat kebutuhan pengunjung.",
      inputSchema: z.object({ summary: z.string().describe("Ringkasan 1 kalimat, tanpa data pribadi.") }),
      execute: async ({ summary }) => ({ url: vitaWhatsappUrl(summary) }),
    }),
  };

  const result = streamText({
    model,
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: stepCountIs(6),
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onError: (e) => {
        console.error("vita stream", e);
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 429) return "Asisten sedang sibuk. Coba lagi sebentar lagi.";
        if (status === 402) return "Asisten sedang tidak tersedia. Silakan chat admin via WhatsApp.";
        return "Maaf, Vita sedang gangguan. Coba lagi atau chat admin via WhatsApp.";
      },
  });
}
