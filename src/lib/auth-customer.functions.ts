// Akun pelanggan (tanpa kata sandi): selesai-login, data & riwayat pesanan sendiri, simpan data.
// Penegakan di database: RLS "Customer reads own record" / "Customers read orders of own customer",
// RPC update_my_customer (authenticated) dan claim_customer_for_user (service_role saja).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveSubject, type Ctx } from "./admin.functions";

/** Alamat tujuan sesudah login: hanya jalur internal, tidak pernah URL luar. */
export function safeNext(next: unknown, fallback = "/akun"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

export const completeLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderToken: z.string().min(32).max(200).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const subject = await resolveSubject(ctx);
    if (subject.role) return { staff: true as const, claimed: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: au } = await supabaseAdmin.auth.admin.getUserById(ctx.userId);
    // Email hanya dipakai untuk klaim bila SUDAH terverifikasi (link ajaib memverifikasinya).
    const verifiedEmail = au?.user?.email_confirmed_at ? (au.user.email ?? null) : null;
    const { data: cid } = await supabaseAdmin.rpc("claim_customer_for_user", {
      _user_id: ctx.userId,
      ...(verifiedEmail ? { _verified_email: verifiedEmail } : {}),
      ...(data.orderToken ? { _order_token: data.orderToken } : {}),
    });
    return { staff: false as const, claimed: !!cid };
  });

export type MyAccount = {
  email: string | null;
  customer: {
    name: string;
    whatsapp: string;
    address: string | null;
    marketingOptIn: boolean;
  } | null;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    stage: string;
    total: number;
    createdAt: string;
    accessToken: string;
    items: Array<{ name: string; quantity: number }>;
  }>;
};

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccount> => {
    const email = (context.claims as { email?: string }).email ?? null;
    const { data: c } = await context.supabase
      .from("customers")
      .select("id,name,whatsapp_normalized,default_address,marketing_opt_in")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!c) return { email, customer: null, orders: [] };
    const { data: rows } = await context.supabase
      .from("orders")
      .select("id,order_number,status,stage,total,created_at,access_token,order_items(name,quantity)")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(30);
    return {
      email,
      customer: {
        name: c.name,
        whatsapp: c.whatsapp_normalized,
        address: c.default_address,
        marketingOptIn: c.marketing_opt_in,
      },
      orders: (rows ?? []).map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        stage: o.stage,
        total: o.total,
        createdAt: o.created_at,
        accessToken: o.access_token,
        items: (o.order_items ?? []).map((i) => ({ name: i.name, quantity: i.quantity })),
      })),
    };
  });

export const saveMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2, "Nama minimal 2 huruf").max(100),
        address: z.string().trim().max(500),
        marketingOptIn: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_my_customer", {
      _name: data.name,
      _address: data.address,
      _opt_in: data.marketingOptIn,
    });
    if (error) throw new Error("Data belum bisa disimpan. Coba lagi.");
    return { ok: true };
  });
