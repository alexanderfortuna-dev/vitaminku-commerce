// Papan "Pesanan Masuk" untuk admin cabang. Baca & tulis berjalan sebagai pengguna yang masuk (RLS + RPC):
// perubahan tahap HANYA lewat RPC staff_set_order_stage (izin orders_manage, cakupan cabang, hanya maju,
// stok berubah sekali lewat staff_confirm_order / staff_cancel_order). Tidak ada tulis langsung ke tabel orders.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, type Ctx } from "./admin.functions";
import { isOrderStage, type OrderStage, ORDER_STAGES } from "./order-stage";

export interface BoardOrder {
  id: string;
  order_number: string;
  status: string;
  stage: string;
  stage_updated_at: string | null;
  payment_mode: string;
  customer_name: string;
  whatsapp: string;
  city: string;
  courier_label: string;
  total: number;
  stock_shortage: boolean;
  created_at: string;
  customer_note: string | null;
  branch_id: string | null;
  branch_name: string | null;
  order_items: Array<{ name: string; quantity: number }> | null;
}

export interface OrderBoardData {
  /** Pesanan per tahap yang ditampilkan (sudah dikelompokkan di server dengan aturan yang sama seperti effectiveStage). */
  columns: Record<OrderStage, BoardOrder[]>;
  /** Jumlah sebenarnya per tahap (bisa lebih besar daripada baris yang dimuat). */
  counts: Record<OrderStage, number>;
  /** Cabang yang dikunci akun ini (user_roles.branch_id), atau null bila melihat semua cabang. */
  scopeBranchId: string | null;
  /** Pilihan cabang untuk owner/manajer tanpa cabang terkunci. */
  branches: Array<{ id: string; name: string }>;
  loadedAt: string;
}

const COLS =
  "id,order_number,status,stage,stage_updated_at,payment_mode,customer_name,whatsapp,city,courier_label,total,stock_shortage,created_at,customer_note,branch_id,branch_name,order_items(name,quantity)";
const ROWS_PER_STAGE = 60;
const UUID = /^[0-9a-f-]{36}$/i;

/* eslint-disable @typescript-eslint/no-explicit-any */
export const listOrderBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branchId?: string | null } | undefined) => {
    const branchId = d?.branchId ?? null;
    if (branchId !== null && !UUID.test(branchId)) throw new Error("Cabang tidak valid.");
    return { branchId };
  })
  .handler(async ({ data, context }): Promise<OrderBoardData> => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "orders_manage");
    const db = ctx.supabase as any;

    // Cakupan cabang akun ini; database juga menegakkannya di RPC.
    const { data: me } = await db.from("user_roles").select("branch_id").eq("user_id", ctx.userId).maybeSingle();
    const scopeBranchId: string | null = (me?.branch_id as string | null) ?? null;
    const branchFilter = scopeBranchId ?? data.branchId;

    const stageQuery = (stage: OrderStage) => {
      let q = db.from("orders").select(COLS, { count: "exact" });
      if (branchFilter) q = q.eq("branch_id", branchFilter);
      if (stage === "baru") {
        // Pesanan kedaluwarsa/dibatalkan sistem yang tahapnya masih 'baru' dihitung sebagai Batal.
        q = q.eq("stage", "baru").in("status", ["menunggu_konfirmasi", "pending", "paid"]);
      } else if (stage === "batal") {
        q = q.or("stage.eq.batal,and(stage.eq.baru,status.in.(cancelled,expired))");
      } else {
        q = q.eq("stage", stage);
      }
      // Baru: yang terlama dulu (paling mendesak). Tahap lain: terbaru dulu.
      return q.order("created_at", { ascending: stage === "baru" }).limit(ROWS_PER_STAGE);
    };

    const [results, branchRes] = await Promise.all([
      Promise.all(ORDER_STAGES.map((s) => stageQuery(s))),
      scopeBranchId
        ? Promise.resolve({ data: [] as Array<{ id: string; name: string }> })
        : db.from("store_branches").select("id,name").order("display_order").order("name"),
    ]);

    const columns = {} as Record<OrderStage, BoardOrder[]>;
    const counts = {} as Record<OrderStage, number>;
    ORDER_STAGES.forEach((s, idx) => {
      const r = results[idx] as { data: BoardOrder[] | null; count: number | null; error: { message: string } | null };
      if (r.error) throw new Error(`Pesanan gagal dimuat: ${r.error.message}`);
      columns[s] = r.data ?? [];
      counts[s] = r.count ?? columns[s].length;
    });

    return {
      columns,
      counts,
      scopeBranchId,
      branches: ((branchRes as any).data ?? []) as Array<{ id: string; name: string }>,
      loadedAt: new Date().toISOString(),
    };
  });

export const advanceOrderStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; stage: string }) => {
    if (!d || typeof d.orderId !== "string" || !UUID.test(d.orderId)) throw new Error("Pesanan tidak valid.");
    if (!isOrderStage(d.stage) || d.stage === "baru") throw new Error("Tahap tidak valid.");
    return { orderId: d.orderId, stage: d.stage };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "orders_manage");
    const { data: result, error } = await (ctx.supabase as any).rpc("staff_set_order_stage", {
      _order_id: data.orderId,
      _stage: data.stage,
    });
    if (error) throw new Error(error.message); // dipetakan ke kalimat sederhana di klien (friendlyStageError)
    return { stage: String(result) };
  });
