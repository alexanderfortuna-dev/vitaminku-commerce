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

/** Batas laju per IP+UA lewat RPC chat_rate_hit. Gagal-terbuka bila RPC/IP tidak tersedia (jangan kunci pelanggan sungguhan). */
async function enforceOrderRateLimit(core: typeof import("./checkout-core")) {
  try {
    const req = getRequest();
    const ip = req ? core.clientIpFrom(req.headers) : null;
    if (!ip) return;
    const visitor = await core.orderVisitorHash(ip, req!.headers.get("user-agent") ?? "");
    const { data: allowed, error } = await publicClient().rpc("chat_rate_hit", {
      _visitor: visitor,
      _limit: core.ORDER_RATE_LIMIT,
      _window_minutes: core.ORDER_RATE_WINDOW_MINUTES,
    });
    if (error) {
      console.error("order rate limit", error.message);
      return;
    }
    if (allowed === false) throw new Error(core.ORDER_RATE_LIMIT_MESSAGE);
  } catch (e) {
    if (e instanceof Error && e.message === core.ORDER_RATE_LIMIT_MESSAGE) throw e;
    console.error("order rate limit failed", e instanceof Error ? e.message : "unknown");
  }
}

interface CreatedOrder {
  order_id: string;
  order_number: string;
  access_token: string;
  duplicate: boolean;
  branch_name: string | null;
  branch_whatsapp: string | null;
  subtotal: number;
  discount_total: number;
  shipping_cost: number;
  total: number;
  payment_url: string | null;
  items: Array<{ slug: string; sku: string; name: string; quantity: number; unit_price: number; line_total: number }>;
}

/** Pesan galat database -> kalimat untuk pelanggan (kode di depan tanda ":" dipetakan). */
export function createOrderMessage(raw: string | undefined): string {
  const code = (raw ?? "").split(":")[0]?.trim();
  switch (code) {
    case "produk_tidak_tersedia":
      return "Ada produk di keranjang yang sudah tidak tersedia. Hapus lalu coba lagi.";
    case "produk_tanpa_harga":
      return "Ada produk yang harganya belum ditetapkan. Tanya harga via WhatsApp.";
    case "stok_kurang":
      return "Stok salah satu produk tidak cukup. Kurangi jumlahnya.";
    case "cabang_tidak_tersedia":
      return "Cabang tidak tersedia. Pilih cabang lain.";
    default:
      return "Pesanan gagal dibuat. Coba lagi.";
  }
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
        // Kotak centang opsional (default tidak tercentang): info promo lewat WhatsApp.
        marketingOptIn: z.boolean().optional(),
        // Dibuat browser sekali per percobaan pesan; kirim ganda dengan kunci sama = satu pesanan.
        idempotencyKey: z.string().trim().min(16).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const core = await import("./checkout-core");
    const { normalizeWhatsapp } = core;
    const server = await import("./checkout.server");
    await enforceOrderRateLimit(core);
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

    const { cleanReferral } = await import("./referral");
    const referralCode = cleanReferral(data.referralCode);
    const userId = await optionalUserId();

    // Branch routing: only an active branch from the database. Destination = ref admin (if active in this
    // branch) > active "utama" admin > branch number > main number. branch_admins is read via the service role.
    let branch: { id: string | null; name: string | null; whatsapp: string } = { id: null, name: null, whatsapp: core.FALLBACK_WHATSAPP };
    if (data.branchId) {
      const { data: b } = await publicClient().from("store_branches").select("id,name,whatsapp").eq("id", data.branchId).eq("is_active", true).maybeSingle();
      if (!b) throw new Error("Cabang tidak tersedia. Pilih cabang lain.");
      branch = b;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (branch.id) {
      try {
        const { data: contacts } = await publicClient().rpc("public_branch_contacts");
        let refAdmin: { branch_id: string; whatsapp: string } | null = null;
        if (referralCode) {
          const { data: a } = await supabaseAdmin
            .from("branch_admins")
            .select("branch_id,whatsapp")
            .eq("referral_code", referralCode)
            .eq("is_active", true)
            .maybeSingle();
          refAdmin = a ?? null;
        }
        const dest = core.pickWhatsappDestination({
          branchId: branch.id,
          branchWhatsapp: branch.whatsapp,
          contacts: contacts ?? [],
          refAdmin,
        });
        branch = { ...branch, whatsapp: dest.whatsapp };
      } catch (e) {
        // Kontak admin gagal dibaca: pakai nomor cabang seperti sebelumnya.
        console.error("branch admin routing failed", e instanceof Error ? e.message : "unknown");
      }
    }
    // Satu panggilan atomik & idempoten: harga dihitung ulang dari tabel products di dalam database,
    // kunci yang sama = pesanan yang sama (kirim ganda tidak membuat pesanan baru).
    const { data: created, error } = await supabaseAdmin.rpc("create_order", {
      idempotency_key: data.idempotencyKey,
      payload: {
        lines: quote.lines.map((l) => ({ slug: l.slug, quantity: l.quantity })),
        customer: { name: data.customer.name, whatsapp, address: data.customer.address, note: data.customer.note || null },
        area: { id: area.id, province: area.province, city: area.city, district: area.district, postal_code: area.postal_code },
        payment_mode: method,
        shipping: { mode: shippingMode, company: rate.company, service: rate.service, label: rate.label, cost: rate.price },
        discount_total: quote.discount,
        promo_code: quote.promoCode,
        referral_code: referralCode,
        branch_id: branch.id,
        branch_whatsapp: branch.whatsapp,
        user_id: userId,
      },
    });
    const order = created as unknown as CreatedOrder | null;
    if (error || !order) {
      console.error("create_order failed", error?.message);
      throw new Error(createOrderMessage(error?.message));
    }
    const orderNumber = order.order_number;
    const accessToken = order.access_token;
    const buildWaUrl = async () => {
      const { whatsappOrderUrl } = await import("./whatsapp-order");
      return whatsappOrderUrl(order.branch_whatsapp ?? branch.whatsapp, {
        order_number: orderNumber,
        items: order.items.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unit_price })),
        subtotal: order.subtotal,
        discount_total: order.discount_total,
        promo_code: quote.promoCode,
        note: data.customer.note || null,
        shipping_cost: order.shipping_cost,
        shipping_mode: shippingMode,
        courier_label: rate.label,
        total: order.total,
        customer_name: data.customer.name,
        whatsapp,
        address: data.customer.address,
        district: area.district,
        city: area.city,
        province: area.province,
        postal_code: area.postal_code,
        branch_name: order.branch_name ?? branch.name,
      });
    };
    const total = order.total;
    if (order.duplicate) {
      // Kirim ulang dengan kunci sama: pesanan yang sama, tanpa efek samping lagi.
      return { orderNumber, accessToken, paymentUrl: order.payment_url, paymentMode: method, total, waUrl: await buildWaUrl() };
    }

    // Pelanggan (tamu maupun login): satu panggilan per pesanan. Gagal di sini tidak boleh menggagalkan pesanan.
    try {
      const { data: customerId, error: custError } = await supabaseAdmin.rpc("upsert_customer_for_order", {
        _whatsapp: whatsapp,
        _name: data.customer.name,
        _address: data.customer.address,
        _opt_in: data.marketingOptIn === true,
        ...(userId ? { _user_id: userId } : {}),
        _total: total,
      });
      if (custError || !customerId) console.error("customer upsert failed", custError?.message);
      else await supabaseAdmin.from("orders").update({ customer_id: customerId }).eq("id", order.order_id);
    } catch (e) {
      console.error("customer upsert failed", e instanceof Error ? e.message : "unknown");
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
      await supabaseAdmin.from("orders").update({ payment_token: snap.token, payment_url: paymentUrl }).eq("id", order.order_id);
    }
    const waUrl = await buildWaUrl();
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
    // get_order_by_token hanya untuk service_role: token (48 hex) diperiksa di server, bukan langsung dari browser.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin.rpc("get_order_by_token", { _token: data.token });
    if (error) throw new Error("Pesanan tidak bisa dibaca.");
    return (order ?? null) as unknown as PublicOrder | null;
  });


/** Kontak tambahan + status "Simpan data saya" untuk halaman pesanan. Hanya nomor admin aktif; tanpa nama/kode ref. */
export const getOrderContacts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[a-f0-9]{48}$/) }).parse(d))
  .handler(async ({ data }) => {
    const empty = { others: [] as Array<{ role: string; whatsapp: string }>, canSave: false };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: o } = await supabaseAdmin
        .from("orders")
        .select("branch_id,branch_whatsapp,customer_id")
        .eq("access_token", data.token)
        .maybeSingle();
      if (!o) return empty;
      let others: Array<{ role: string; whatsapp: string }> = [];
      if (o.branch_id) {
        const { otherAdmins } = await import("./checkout-core");
        const { data: contacts } = await publicClient().rpc("public_branch_contacts");
        // Nomor tujuan = yang tersimpan di pesanan (bisa admin ?ref); tampilkan admin aktif selain itu.
        others = otherAdmins(contacts ?? [], o.branch_id, o.branch_whatsapp);
      }
      let canSave = false;
      if (o.customer_id && !(await optionalUserId())) {
        const { data: c } = await supabaseAdmin.from("customers").select("user_id").eq("id", o.customer_id).maybeSingle();
        canSave = !!c && c.user_id == null;
      }
      return { others, canSave };
    } catch (e) {
      console.error("order contacts failed", e instanceof Error ? e.message : "unknown");
      return empty;
    }
  });
