// Seller Center: staf membuat link bayar Midtrans untuk pesanan WhatsApp. Jumlah diambil dari total di database (setelah ongkir
// diisi lewat fungsi ber-izin staff_set_shipping); satu pesanan = satu token (klik ulang mengembalikan link yang sama).
// Status bayar tidak diubah di sini: hanya webhook bertanda tangan (processNotification -> apply_order_payment_status).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requireRole, type Ctx } from "./admin.functions";

const ORDER_COLS =
  "id,order_number,access_token,status,payment_mode,shipping_mode,shipping_cost,subtotal,discount_total,total,promo_code,payment_token,payment_url,customer_name,whatsapp,address,city,postal_code,order_items(sku,name,unit_price,quantity)";

type OrderRow = Record<string, unknown> & { order_items?: Array<{ sku: string; name: string; unit_price: number; quantity: number }> };

function toLinkOrder(r: OrderRow): import("./payment-link").LinkOrder {
  return {
    id: String(r["id"]),
    order_number: String(r["order_number"]),
    status: String(r["status"]),
    payment_mode: String(r["payment_mode"]),
    shipping_mode: String(r["shipping_mode"]),
    shipping_cost: Number(r["shipping_cost"]),
    subtotal: Number(r["subtotal"]),
    discount_total: Number(r["discount_total"] ?? 0),
    total: Number(r["total"]),
    promo_code: (r["promo_code"] as string | null) ?? null,
    payment_token: (r["payment_token"] as string | null) ?? null,
    payment_url: (r["payment_url"] as string | null) ?? null,
    customer_name: String(r["customer_name"]),
    whatsapp: String(r["whatsapp"]),
    items: (r.order_items ?? []).map((i) => ({ sku: i.sku, name: i.name, unit_price: Number(i.unit_price), quantity: Number(i.quantity) })),
  };
}

export const createPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        // Wajib untuk pesanan ongkir-manual (WhatsApp): ongkir yang dikonfirmasi staf. Abaikan untuk ongkir kurir.
        shippingCost: z.number().int().min(0).max(2_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const server = await import("./checkout.server");
    const { linkGate, snapItemsFromOrder, paymentLinkWhatsapp } = await import("./payment-link");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;

    const read = async () => {
      const { data: row, error } = await db.from("orders").select(ORDER_COLS).eq("id", data.orderId).maybeSingle();
      if (error) throw new Error(`Pesanan gagal dibaca: ${error.message}`);
      if (!row) throw new Error("Pesanan tidak ditemukan.");
      return row as OrderRow;
    };
    const done = (o: import("./payment-link").LinkOrder, url: string, reused: boolean) => ({ url, reused, total: o.total, ...paymentLinkWhatsapp(o, url) });

    let row = await read();
    let order = toLinkOrder(row);
    const gate = linkGate(order, server.modes().payment === "midtrans");
    if (!gate.ok) throw new Error(gate.message);
    if (gate.reuse) return done(order, order.payment_url!, true);

    if (order.shipping_mode === "manual") {
      if (data.shippingCost === undefined) throw new Error("Isi ongkir dulu (angka rupiah, boleh 0 bila gratis).");
      const { error } = await db.rpc("staff_set_shipping", { _order_id: order.id, _cost: data.shippingCost });
      if (error) {
        if (/staff_set_shipping|function .* does not exist|schema cache/i.test(error.message)) throw new Error("Pembaruan database 0018 belum dipasang (mode pasang-database).");
        throw new Error(error.message);
      }
      row = await read();
      order = toLinkOrder(row);
    }
    const items = snapItemsFromOrder(order); // melempar bila rincian ≠ total

    const origin = new URL(getRequest()!.url).origin;
    let snap: { token: string; redirect_url: string };
    try {
      snap = await server.createSnapTransaction({
        orderNumber: order.order_number,
        total: order.total,
        items,
        customer: { name: order.customer_name, phone: order.whatsapp, address: String(row["address"] ?? ""), city: String(row["city"] ?? ""), postal_code: String(row["postal_code"] ?? "") },
        finishUrl: `${origin}/pesanan/${String(row["access_token"])}`,
      });
    } catch (e) {
      // Mungkin link untuk pesanan ini sudah dibuat bersamaan oleh staf lain: baca ulang sebelum menyerah.
      const again = toLinkOrder(await read());
      if (again.payment_token && again.payment_url) return done(again, again.payment_url, true);
      throw e;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Hanya menulis bila belum ada token (menang-balapan): dua klik bersamaan tidak saling menimpa.
    const save = (extra: Record<string, unknown>) =>
      supabaseAdmin.from("orders").update({ payment_token: snap.token, payment_url: snap.redirect_url, ...extra }).eq("id", order.id).is("payment_token", null).select("id");
    let { data: saved, error: saveErr } = await save({ payment_link_at: new Date().toISOString() });
    if (saveErr && /payment_link_at/.test(saveErr.message)) ({ data: saved, error: saveErr } = await save({})); // sebelum migrasi 0018
    if (saveErr) throw new Error(`Link dibuat tetapi gagal disimpan: ${saveErr.message}`);
    if (!saved?.length) {
      const again = toLinkOrder(await read());
      if (again.payment_url) return done(again, again.payment_url, true);
    }
    await audit(ctx, "order_payment_link", null, { order_number: order.order_number, total: order.total });
    return done(order, snap.redirect_url, false);
  });
