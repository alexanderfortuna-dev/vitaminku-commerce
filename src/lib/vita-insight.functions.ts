// Wawasan Vita untuk staf (Seller Center): kueri tanpa hasil teratas untuk memperluas taksonomi.
// Dibaca sebagai pengguna yang login lewat RPC vita_insight (database memeriksa has_permission 'reports_view').
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, type Ctx } from "./admin.functions";

export interface VitaInsight {
  installed: boolean;
  days: number;
  answers: number;
  zero_results: number;
  chosen: number;
  ai_answers: number;
  top_zero: Array<{ query_text: string; hits: number; last_seen: string }>;
  by_goal: Array<{ goal: string; hits: number }>;
}

const EMPTY = (days: number): VitaInsight => ({ installed: false, days, answers: 0, zero_results: 0, chosen: 0, ai_answers: 0, top_zero: [], by_goal: [] });

export const getVitaInsight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { days?: number }) => ({ days: Math.min(365, Math.max(1, Math.round(Number(i?.days) || 30))) }))
  .handler(async ({ data, context }): Promise<VitaInsight> => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "reports_view");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: j, error } = await (ctx.supabase as any).rpc("vita_insight", { p_days: data.days });
    if (error) {
      // Migrasi 0017 belum dipasang: tampilkan status "belum aktif", bukan galat.
      if (error.code === "PGRST202" || /vita_insight/.test(String(error.message))) return EMPTY(data.days);
      throw new Error(error.message);
    }
    return { installed: true, ...(j as Omit<VitaInsight, "installed">) };
  });
