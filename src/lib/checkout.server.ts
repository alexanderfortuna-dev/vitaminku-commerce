// Server-only checkout integrations: Biteship rates/areas, Midtrans Snap, status processing.
import {
  DEFAULT_ORIGIN_POSTAL_CODE,
  mapMidtransStatus,
  resolveModes,
  verifyMidtransSignature,
} from "./checkout-core";
import { MANUAL_SHIPPING_LABEL } from "./whatsapp-order";
import { notificationAction } from "./payment-link";
import { biteshipItems, parseRates, regularRatesBody, type BranchOrigin, type Rate, type RateLineInput } from "./shipping-quote";
import { instantEligibility, instantRatesBody, isInstantService, parseMaxKm, type InstantDecision, type LatLng } from "./instant-delivery";

export type { Rate } from "./shipping-quote";

export function checkoutEnv() {
  return {
    MIDTRANS_SERVER_KEY: process.env["MIDTRANS_SERVER_KEY"],
    MIDTRANS_CLIENT_KEY: process.env["MIDTRANS_CLIENT_KEY"],
    MIDTRANS_IS_PRODUCTION: process.env["MIDTRANS_IS_PRODUCTION"],
    BITESHIP_API_KEY: process.env["BITESHIP_API_KEY"],
  };
}

export function modes() {
  return resolveModes(checkoutEnv());
}

export function originPostalCode() {
  return process.env["SHIPPING_ORIGIN_POSTAL_CODE"]?.trim() || DEFAULT_ORIGIN_POSTAL_CODE;
}

export interface Area {
  id: string;
  label: string;
  province: string;
  city: string;
  district: string;
  postal_code: string;
}

const BITESHIP = "https://api.biteship.com/v1";

async function biteship(path: string, init?: RequestInit) {
  const res = await fetch(`${BITESHIP}${path}`, {
    ...init,
    headers: {
      authorization: process.env["BITESHIP_API_KEY"]!,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Biteship ${path} failed [${res.status}]: ${text}`);
    throw new Error("Layanan pengiriman sedang bermasalah. Coba lagi sebentar.");
  }
  return JSON.parse(text);
}

export async function searchAreas(query: string): Promise<{ mode: "biteship"; areas: Area[] }> {
  if (modes().shipping !== "biteship") throw new Error("Pencarian area belum tersedia.");
  const data = await biteship(`/maps/areas?countries=ID&type=single&input=${encodeURIComponent(query)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areas: Area[] = (data.areas ?? []).slice(0, 15).map((a: any) => ({
    id: String(a.id),
    province: a.administrative_division_level_1_name ?? "",
    city: a.administrative_division_level_2_name ?? "",
    district: a.administrative_division_level_3_name ?? "",
    postal_code: String(a.postal_code ?? ""),
    label: a.name ?? "",
  }));
  return { mode: "biteship", areas };
}

export interface ShippingBranch extends BranchOrigin {
  lat?: number | null;
  lng?: number | null;
  instant_delivery?: boolean | null;
}

export interface ShippingRatesInput {
  areaId: string;
  postalCode: string;
  lines: RateLineInput[];
  /** Cabang terpilih: asal kiriman dan (bila siap) kurir instan. Kosong = asal toko dari env. */
  branch?: ShippingBranch | null;
  /** Lokasi pelanggan hanya dipakai bila ia menyetujui ("Gunakan lokasi saya"). */
  customer?: LatLng | null;
  locationConsent?: boolean;
}

export interface ShippingRatesResult {
  mode: "biteship" | "manual";
  rates: Rate[];
  /** Mengapa opsi instan tidak muncul (untuk log/uji; tidak ditampilkan ke pelanggan). */
  instant: InstantDecision | { ok: false; reason: "mode_manual" };
  /** Jumlah baris keranjang yang memakai berat cadangan karena data produk belum lengkap. */
  fallbackLines: number;
}

export function instantEnabled(): boolean {
  return String(process.env["INSTANT_DELIVERY_ENABLED"] ?? "").trim().toLowerCase() === "true";
}

export async function shippingRates(input: ShippingRatesInput): Promise<ShippingRatesResult> {
  if (modes().shipping === "manual") {
    return {
      mode: "manual",
      rates: [{ company: "manual", service: "admin", label: MANUAL_SHIPPING_LABEL, price: 0, etd: "", kind: "regular" }],
      instant: { ok: false, reason: "mode_manual" },
      fallbackLines: 0,
    };
  }
  const { body, fallbackLines } = regularRatesBody({
    branch: input.branch,
    envPostal: process.env["SHIPPING_ORIGIN_POSTAL_CODE"],
    destination: { areaId: input.areaId, postalCode: input.postalCode },
    lines: input.lines,
  });
  const data = await biteship("/rates/couriers", { method: "POST", body: JSON.stringify(body) });
  const rates = parseRates(data, "regular");

  // Instan Bali: hanya bila semua syarat lolos; gagal diam-diam (ongkir reguler tetap tampil) bila Biteship menolak.
  const instant = instantEligibility({
    enabled: instantEnabled(),
    branch: input.branch ? { lat: input.branch.lat ?? null, lng: input.branch.lng ?? null, instant_delivery: input.branch.instant_delivery === true } : null,
    customer: input.customer ?? null,
    consent: input.locationConsent === true,
    maxKm: parseMaxKm(process.env["INSTANT_MAX_KM"]),
  });
  if (instant.ok && input.branch && input.customer) {
    try {
      const idata = await biteship("/rates/couriers", {
        method: "POST",
        body: JSON.stringify(
          instantRatesBody({
            from: { lat: input.branch.lat as number, lng: input.branch.lng as number },
            to: input.customer,
            items: biteshipItems(input.lines).items,
          }),
        ),
      });
      rates.push(...parseRates(idata, "instant").filter((r) => isInstantService(r.service)));
      rates.sort((a, b) => a.price - b.price);
    } catch (e) {
      console.error("Tarif instan gagal, ongkir reguler tetap dipakai:", e instanceof Error ? e.message : e);
    }
  }
  return { mode: "biteship", rates, instant, fallbackLines };
}

export async function createSnapTransaction(input: {
  orderNumber: string;
  total: number;
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
  customer: { name: string; phone: string; address: string; city: string; postal_code: string };
  finishUrl: string;
}): Promise<{ token: string; redirect_url: string }> {
  const m = modes();
  const base = m.isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
  const auth = btoa(`${process.env["MIDTRANS_SERVER_KEY"]!}:`);
  const res = await fetch(`${base}/snap/v1/transactions`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderNumber, gross_amount: input.total },
      item_details: input.items.map((i) => ({ ...i, name: i.name.slice(0, 50) })),
      customer_details: {
        first_name: input.customer.name.slice(0, 50),
        phone: input.customer.phone,
        shipping_address: {
          first_name: input.customer.name.slice(0, 50),
          phone: input.customer.phone,
          address: input.customer.address.slice(0, 200),
          city: input.customer.city,
          postal_code: input.customer.postal_code,
          country_code: "IDN",
        },
      },
      // QRIS first.
      enabled_payments: ["other_qris", "gopay", "shopeepay", "bca_va", "bni_va", "bri_va", "permata_va", "echannel", "other_va"],
      callbacks: { finish: input.finishUrl },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Midtrans Snap failed [${res.status}]: ${text}`);
    throw new Error("Pembayaran gagal disiapkan. Coba lagi sebentar.");
  }
  return JSON.parse(text);
}

/** Server key used to verify notifications; null when Midtrans is not configured. */
export function notificationKey(): string | null {
  return modes().payment === "midtrans" ? process.env["MIDTRANS_SERVER_KEY"]! : null;
}

export type NotificationResult =
  | { ok: true; result: string }
  | { ok: false; status: number; error: string };

/** Verifies and applies a Midtrans-style notification. Idempotent via apply_order_payment_status. */
export async function processNotification(n: Record<string, unknown>): Promise<NotificationResult> {
  const key = notificationKey();
  if (!key) return { ok: false, status: 503, error: "not configured" };
  if (!verifyMidtransSignature(n, key)) return { ok: false, status: 401, error: "invalid signature" };
  const status = mapMidtransStatus(String(n["transaction_status"] ?? ""), (n["fraud_status"] as string) ?? null);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id,total,payment_mode,payment_token")
    .eq("order_number", String(n["order_id"]))
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "lookup failed" };
  if (!order) return { ok: false, status: 404, error: "order not found" };
  // Pesanan Midtrans biasa: semua status. Pesanan WhatsApp yang punya link bayar buatan staf: hanya "paid".
  const action = notificationAction(order, status);
  if (action === "reject_mode") return { ok: false, status: 409, error: "payment mode mismatch" };
  if (Math.round(Number(n["gross_amount"])) !== order.total) return { ok: false, status: 400, error: "amount mismatch" };
  if (action === "ignore" || !status) return { ok: true, result: "ignored" };
  const { data: result, error: rpcError } = await supabaseAdmin.rpc("apply_order_payment_status", {
    _order_id: order.id,
    _status: status,
    _transaction_status: String(n["transaction_status"]),
  });
  if (rpcError) {
    console.error("apply_order_payment_status failed", rpcError.message);
    return { ok: false, status: 500, error: "update failed" };
  }
  return { ok: true, result: String(result) };
}
