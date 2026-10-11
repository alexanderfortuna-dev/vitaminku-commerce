// Native checkout server functions. Totals come only from database prices
// (quoteOrderLines) and server-fetched shipping rates; the browser sends slugs,
// quantities, address and the chosen courier only.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const linesSchema = z
  .array(z.object({ slug: z.string().min(1).max(200), quantity: z.number().int().min(1).max(99) }))
  .min(1)
  .max(60);

const promoCodeSchema = z.string().trim().max(32).optional().nullable();

async function quoteLines(lines: Array<{ slug: string; quantity: number }>, promoCode?: string | null) {
  const { quoteOrderLines } = await import("./order-pricing");
  const { normalizePromoCode } = await import("./promo");
  const slugs = Array.from(new Set(lines.map((l) => l.slug)));
  const client = publicClient();
  const { data: rows, error } = await client
    .from("products")
    .select("id,sku,slug,name,brand,price,stock,is_active,is_blocked")
    .in("slug", slugs);
  if (error) throw new Error("Katalog tidak bisa dibaca. Coba lagi.");
  // Promo comes from the database only (RLS returns running promos); the browser sends just a code.
  let promo = null;
  let promoError: string | null = null;
  const code = promoCode ? normalizePromoCode(promoCode) : "";
  if (code) {
    const { data: p } = await client
      .from("promos")
      .select("code,label,kind,value,brand,starts_at,ends_at")
      .eq("code", code)
      .maybeSingle();
    if (!p) promoError = "Kode diskon tidak berlaku saat ini.";
    else promo = { ...p, value: Number(p.value) };
  }
  const quote = quoteOrderLines(lines, (rows ?? []) as never, promo);
  if (promo && !quote.promoCode) promoError = "Kode diskon tidak berlaku untuk produk di keranjang.";
  const bySlug = new Map((rows ?? []).map((r) => [r.slug, r]));
  return { quote, bySlug, promoError, promoLabel: quote.promoCode ? promo!.label : null };
}

function rejectionMessage(reason: string) {
  return {
    not_found: "tidak ditemukan",
    unavailable: "tidak tersedia",
    no_price: "belum ada harga",
    out_of_stock: "stok tidak cukup",
  }[reason] ?? reason;
}

export const getCheckoutModes = createServerFn({ method: "GET" }).handler(async () => {
  const { modes } = await import("./checkout.server");
  try {
    const m = modes();
    return { ok: true as const, payment: m.payment, shipping: m.shipping, isProduction: m.isProduction };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Checkout belum siap." };
  }
});

export const quoteCart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ lines: linesSchema, promoCode: promoCodeSchema }).parse(d))
  .handler(async ({ data }) => {
    const { quote, promoError, promoLabel } = await quoteLines(data.lines, data.promoCode);
    return { ...quote, promoError, promoLabel };
  });

export const searchShippingAreas = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(3).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { searchAreas } = await import("./checkout.server");
    return searchAreas(data.q);
  });

const areaSchema = z.object({
  id: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  district: z.string().min(1).max(100),
  postal_code: z.string().regex(/^\d{5}$/, "Kode pos 5 digit"),
});

export const getShippingRates = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ lines: linesSchema, area: areaSchema }).parse(d))
  .handler(async ({ data }) => {
    const { shippingRates } = await import("./checkout.server");
    const { quote } = await quoteLines(data.lines);
    if (quote.rejected.length) throw new Error("Ada produk di keranjang yang tidak bisa dibeli.");
    return shippingRates(
      data.area.id,
      data.area.postal_code,
      quote.lines.map((l) => ({ name: l.name, value: l.unitPrice, quantity: l.quantity })),
    );
  });

async function optionalUserId(): Promise<string | null> {
  const auth = getRequest()?.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data } = await publicClient().auth.getUser(auth.slice(7));
  return data.user?.id ?? null;
}

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        lines: linesSchema,
        customer: z.object({
          name: z.string().trim().min(2).max(100),
          whatsapp: z.string().trim().min(8).max(20),
          address: z.string().trim().min(10).max(500),
          note: z.string().trim().max(300).optional().nullable(),
        }),
        // Optional in manual shipping mode (branch confirms via WhatsApp).
        area: areaSchema.nullable().optional(),
        promoCode: promoCodeSchema,
        referralCode: z.string().trim().max(32).optional().nullable(),
        courier: z.object({ company: z.string().min(1).max(50), service: z.string().min(1).max(50) }),
        method: z.enum(["midtrans", "whatsapp"]).default("whatsapp"),
        branchId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { normalizeWhatsapp, makeOrderNumber } = await import("./checkout-core");
    const server = await import("./checkout.server");
    const m = server.modes();
    const whatsapp = normalizeWhatsapp(data.customer.whatsapp);
    if (!whatsapp) throw new Error("Nomor WhatsApp tidak valid.");
    if (data.method === "midtrans" && m.payment !== "midtrans") throw new Error("Pembayaran online belum tersedia. Pesan via WhatsApp.");
    const method = data.method;

    const { quote, bySlug, promoError } = await quoteLines(data.lines, data.promoCode);
    if (data.promoCode && promoError) throw new Error(promoError);
    if (quote.rejected.length) {
      const r = quote.rejected[0]!;
      throw new Error(`Produk ${bySlug.get(r.slug)?.name ?? r.slug} ${rejectionMessage(r.reason)}.`);
    }
    if (quote.lines.length === 0) throw new Error("Keranjang kosong.");

    if (m.shipping !== "manual" && !data.area) throw new Error("Pilih kecamatan/kota tujuan.");
    const area = data.area ?? { id: "MANUAL", province: "", city: "", district: "", postal_code: "" };
    // Re-fetch rates on the server; the browser only names the courier.
    const { mode: shippingMode, rates } = await server.shippingRates(
      area.id,
      area.postal_code,
      quote.lines.map((l) => ({ name: l.name, value: l.unitPrice, quantity: l.quantity })),
    );
    const rate = rates.find((r) => r.company === data.courier.company && r.service === data.courier.service);
    if (!rate) throw new Error("Ongkir berubah. Pilih kurir lagi.");

    const total = quote.subtotal - quote.discount + rate.price;
    const { cleanReferral } = await import("./referral");
    const referralCode = cleanReferral(data.referralCode);
    const orderNumber = makeOrderNumber(new Date(), randomHex(3));
    const accessToken = randomHex(24);
    const userId = await optionalUserId();

    // Branch routing: only an active branch from the database; else the main number.
    let branch: { id: string | null; name: string | null; whatsapp: string } = { id: null, name: null, whatsapp: "6281339950000" };
    if (data.branchId) {
      const { data: b } = await publicClient().from("store_branches").select("id,name,whatsapp").eq("id", data.branchId).eq("is_active", true).maybeSingle();
      if (!b) throw new Error("Cabang tidak tersedia. Pilih cabang lain.");
      branch = b;
    }


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        access_token: accessToken,
        user_id: userId,
        payment_mode: method,
        status: method === "whatsapp" ? "menunggu_konfirmasi" : "pending",
        shipping_mode: shippingMode,
        customer_name: data.customer.name,
        whatsapp,
        address: data.customer.address,
        province: area.province,
        city: area.city,
        district: area.district,
        postal_code: area.postal_code,
        area_id: area.id,
        courier_company: rate.company,
        courier_service: rate.service,
        courier_label: rate.label,
        subtotal: quote.subtotal,
        shipping_cost: rate.price,
        total,
        discount_total: quote.discount,
        promo_code: quote.promoCode,
        referral_code: referralCode,
        customer_note: data.customer.note || null,
        branch_id: branch.id,
        branch_name: branch.name,
        branch_whatsapp: branch.whatsapp,
      })
      .select("id")
      .single();
    if (error || !order) {
      console.error("order insert failed", error?.message);
      throw new Error("Pesanan gagal dibuat. Coba lagi.");
    }
    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(
      quote.lines.map((l) => {
        const row = bySlug.get(l.slug)!;
        return {
          order_id: order.id,
          product_id: row.id,
          slug: l.slug,
          sku: row.sku,
          name: l.name,
          unit_price: l.unitPrice,
          quantity: l.quantity,
          line_total: l.lineTotal,
        };
      }),
    );
    if (itemsError) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      throw new Error("Pesanan gagal dibuat. Coba lagi.");
    }

    let paymentUrl: string | null = null;
    if (method === "midtrans") {
      const origin = new URL(getRequest()!.url).origin;
      const snap = await server.createSnapTransaction({
        orderNumber,
        total,
        items: [
          ...quote.lines.map((l) => ({ id: bySlug.get(l.slug)!.sku, name: l.name, price: l.unitPrice, quantity: l.quantity })),
          { id: "ONGKIR", name: `Ongkir ${rate.label}`, price: rate.price, quantity: 1 },
          ...(quote.discount > 0 ? [{ id: "DISKON", name: `Diskon ${quote.promoCode}`, price: -quote.discount, quantity: 1 }] : []),
        ],
        customer: { name: data.customer.name, phone: whatsapp, address: data.customer.address, city: area.city, postal_code: area.postal_code },
        finishUrl: `${origin}/pesanan/${accessToken}`,
      });
      paymentUrl = snap.redirect_url;
      await supabaseAdmin.from("orders").update({ payment_token: snap.token, payment_url: paymentUrl }).eq("id", order.id);
    }
    const { whatsappOrderUrl } = await import("./whatsapp-order");
    const waUrl = whatsappOrderUrl(branch.whatsapp, {
      order_number: orderNumber,
      items: quote.lines.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unitPrice })),
      subtotal: quote.subtotal,
      discount_total: quote.discount,
      promo_code: quote.promoCode,
      note: data.customer.note || null,
      shipping_cost: rate.price,
      shipping_mode: shippingMode,
      courier_label: rate.label,
      total,
      customer_name: data.customer.name,
      whatsapp,
      address: data.customer.address,
      district: area.district,
      city: area.city,
      province: area.province,
      postal_code: area.postal_code,
      branch_name: branch.name,
    });
    return { orderNumber, accessToken, paymentUrl, paymentMode: method, total, waUrl };
  });

export interface PublicOrder {
  order_number: string;
  status: "pending" | "menunggu_konfirmasi" | "paid" | "expired" | "cancelled";
  payment_mode: "midtrans" | "whatsapp" | "mock";
  shipping_mode: "biteship" | "manual" | "mock";
  customer_name: string;
  whatsapp: string;
  address: string;
  district: string;
  province: string;
  postal_code: string;
  city: string;
  branch_name: string | null;
  branch_whatsapp: string | null;
  courier_label: string;
  subtotal: number;
  shipping_cost: number;
  discount_total?: number;
  promo_code?: string | null;
  customer_note?: string | null;
  total: number;
  payment_url: string | null;
  created_at: string;
  paid_at: string | null;
  items: Array<{ slug: string; name: string; quantity: number; unit_price: number; line_total: number }>;
}

export const getOrderByToken = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[a-f0-9]{48}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { data: order, error } = await publicClient().rpc("get_order_by_token", { _token: data.token });
    if (error) throw new Error("Pesanan tidak bisa dibaca.");
    return (order ?? null) as unknown as PublicOrder | null;
  });
