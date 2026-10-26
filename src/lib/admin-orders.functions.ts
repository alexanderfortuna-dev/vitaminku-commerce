// Staff order list. Reads run as the signed-in user; RLS lets owner/admin read all orders.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole, type Ctx } from "./admin.functions";

export type OrderStatusFilter = "ALL" | "menunggu_konfirmasi" | "pending" | "paid" | "expired" | "cancelled";

export const listAdminOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: OrderStatusFilter; offset?: number }) => d ?? {})
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const offset = Math.max(0, data.offset ?? 0);
    const COLS =
      "id,order_number,status,payment_mode,customer_name,whatsapp,city,courier_label,total,stock_shortage,created_at,referral_code,promo_code,discount_total,customer_note,shipping_mode,shipping_cost,payment_url,order_items(name,quantity)";
    const fetchPage = (cols: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (ctx.supabase as any).from("orders").select(cols, { count: "exact" });
      if (data.status && data.status !== "ALL") q = q.eq("status", data.status);
      return q.order("created_at", { ascending: false }).range(offset, offset + 29);
    };
    // payment_link_at baru ada setelah migrasi 0018: sebelum itu daftar tetap tampil tanpa kolom itu.
    let { data: rows, count, error } = await fetchPage(`${COLS},payment_link_at`);
    if (error && /payment_link_at/.test(error.message)) ({ data: rows, count, error } = await fetchPage(COLS));
    if (error) throw new Error(`Pesanan gagal dimuat: ${error.message}`);
    return { orders: (rows ?? []) as AdminOrderRow[], total: count ?? 0, nextOffset: (rows?.length ?? 0) === 30 ? offset + 30 : null };
  });

/** Staff actions run as the signed-in user through role-checked database functions (atomic stock). */
export const updateAdminOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; action: "confirm" | "cancel" }) => {
    if (!d || typeof d.orderId !== "string" || !/^[0-9a-f-]{36}$/.test(d.orderId)) throw new Error("Pesanan tidak valid.");
    if (d.action !== "confirm" && d.action !== "cancel") throw new Error("Aksi tidak valid.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const fn = data.action === "confirm" ? "staff_confirm_order" : "staff_cancel_order";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await (ctx.supabase as any).rpc(fn, { _order_id: data.orderId });
    if (error) throw new Error(error.message);
    return { result: String(result) };
  });

export interface AdminOrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_mode: string;
  customer_name: string;
  whatsapp: string;
  city: string;
  courier_label: string;
  total: number;
  stock_shortage: boolean;
  created_at: string;
  referral_code: string | null;
  promo_code: string | null;
  discount_total: number | null;
  customer_note: string | null;
  shipping_mode: string;
  shipping_cost: number;
  payment_url: string | null;
  payment_link_at?: string | null;
  order_items: Array<{ name: string; quantity: number }> | null;
}
