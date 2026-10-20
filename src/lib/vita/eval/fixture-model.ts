// Model tiruan (rekaman perilaku yang benar) untuk menguji jalur AI tanpa kunci API.
// Langkah 1: panggil search_products dengan pesan pelanggan (+ konteks). Langkah 2: pilih 3 produk teratas hasil tool,
// alasan hanya dari kolom tool. Uji model "nakal" ada di src/lib/__tests__/vita-ai.test.ts.
import type { ContentBlock } from "../../../../supabase/functions/_shared/vitamin-finder-core";
import type { VitaCallModel } from "../ai";

const customerText = (s: string) => s.match(/<<<\n([\s\S]*?)\n>>>/g)?.map((b) => b.slice(4, -4)) ?? [];

export function fixtureModel(): VitaCallModel {
  return async (req) => {
    const last = req.messages[req.messages.length - 1];
    const blocks = Array.isArray(last?.content) ? (last!.content as ContentBlock[]) : [];
    const toolResult = blocks.find((b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result");
    if (!toolResult) {
      const texts = req.messages.filter((m) => m.role === "user" && typeof m.content === "string").flatMap((m) => customerText(m.content as string));
      const query = texts.slice(-2).join(" ");
      return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "search_products", input: { query } }] };
    }
    const data = JSON.parse(toolResult.content) as { products: Array<{ id: string; name: string; brand: string; price: number; cost_per_serving: number | null }> };
    const pick = data.products.slice(0, 3);
    const out = pick.length
      ? {
          status: "ok",
          reply_text: `Berikut ${pick.length} pilihan dari katalog VitaminKu yang sesuai kebutuhan Anda.`,
          products: pick.map((p) => ({
            id: p.id,
            alasan: `${p.brand}, Rp ${p.price.toLocaleString("id-ID")}${p.cost_per_serving ? ` (± Rp ${p.cost_per_serving.toLocaleString("id-ID")} per sajian)` : ""}.`,
            cocok_untuk: "kebutuhan yang Anda sebutkan",
            kurang_cocok_jika: "Anda punya kondisi medis tertentu (tanya apoteker)",
          })),
          confidence: 0.8,
        }
      : { status: "needs_input", reply_text: "Boleh ceritakan tujuan Anda? Misalnya tambah otot, tidur, atau daya tahan tubuh.", products: [], confidence: 0.5 };
    return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(out) }] };
  };
}
