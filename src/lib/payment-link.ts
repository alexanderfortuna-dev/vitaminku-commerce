// Link bayar Midtrans untuk pesanan WhatsApp (murni, tanpa I/O). Jumlah tagihan SELALU dari total di database;
// browser tidak pernah mengirim angka. Status bayar hanya berubah lewat webhook bertanda tangan -> apply_order_payment_status.

export interface LinkOrderItem {
  sku: string;
  name: string;
  unit_price: number;
  quantity: number;
}

export interface LinkOrder {
  id: string;
  order_number: string;
  status: string;
  payment_mode: string;
  shipping_mode: string;
  shipping_cost: number;
  subtotal: number;
  discount_total: number;
  total: number;
  promo_code?: string | null;
  payment_token: string | null;
  payment_url: string | null;
  payment_link_at?: string | null;
  customer_name: string;
  whatsapp: string;
  items: LinkOrderItem[];
}

export type LinkGate = { ok: true; reuse: boolean; regenerate?: boolean } | { ok: false; message: string };

/** Link Snap kita berlaku 24 jam (dikirim eksplisit ke Midtrans). Setelah 25 jam dipastikan mati: aman dibuatkan yang baru. */
export const LINK_VALID_HOURS = 24;
export const LINK_REGENERATE_AFTER_HOURS = 25;

/** order_id Midtrans per percobaan: "<nomor pesanan>~<4 huruf/angka>". Percobaan yatim tidak pernah dilihat staf/pelanggan. */
export function snapOrderId(orderNumber: string, rand: string): string {
  return `${orderNumber}~${rand.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).padEnd(4, "0")}`;
}

/** Nomor pesanan dari order_id Midtrans (dengan atau tanpa akhiran percobaan). */
export function orderNumberFromSnapId(orderId: string): string {
  const i = orderId.indexOf("~");
  return i < 0 ? orderId : orderId.slice(0, i);
}

export const MSG_MIDTRANS_OFF = "Aktif setelah kunci Midtrans dipasang.";

/** Boleh membuat link? Link yang sudah ada dipakai ulang (satu pesanan = satu token). */
export function linkGate(
  o: Pick<LinkOrder, "status" | "payment_token" | "payment_url" | "total"> & { payment_link_at?: string | null },
  midtransReady: boolean,
  now: Date = new Date(),
): LinkGate {
  if (!midtransReady) return { ok: false, message: MSG_MIDTRANS_OFF };
  if (o.status !== "menunggu_konfirmasi" && o.status !== "pending") return { ok: false, message: `Pesanan sudah ${o.status}; link bayar tidak bisa dibuat.` };
  if (o.payment_token && o.payment_url) {
    // Waktu pembuatan tidak diketahui (data lama / sebelum migrasi): pakai ulang, tidak menebak.
    const at = o.payment_link_at ? Date.parse(o.payment_link_at) : NaN;
    const ageH = Number.isFinite(at) ? (now.getTime() - at) / 3_600_000 : 0;
    if (ageH > LINK_REGENERATE_AFTER_HOURS) return { ok: true, reuse: false, regenerate: true };
    return { ok: true, reuse: true };
  }
  if (!(o.total > 0)) return { ok: false, message: "Total pesanan tidak valid." };
  return { ok: true, reuse: false };
}

export interface SnapItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

/** Rincian untuk Midtrans: barang + ongkir + diskon (negatif). Jumlahnya WAJIB sama dengan total pesanan. */
export function snapItemsFromOrder(o: LinkOrder): SnapItem[] {
  const items: SnapItem[] = o.items.map((i) => ({ id: i.sku, name: i.name, price: i.unit_price, quantity: i.quantity }));
  if (o.shipping_cost > 0) items.push({ id: "ONGKIR", name: "Ongkir", price: o.shipping_cost, quantity: 1 });
  if (o.discount_total > 0) items.push({ id: "DISKON", name: `Diskon ${o.promo_code ?? ""}`.trim(), price: -o.discount_total, quantity: 1 });
  const sum = items.reduce((n, i) => n + i.price * i.quantity, 0);
  if (sum !== o.total) throw new Error("Rincian pesanan tidak cocok dengan totalnya. Link bayar tidak dibuat; cek pesanan.");
  return items;
}

export type NotificationAction = "apply" | "ignore" | "reject_mode";

/**
 * Pesanan Midtrans biasa: semua status diterapkan (perilaku lama). Pesanan WhatsApp yang punya link bayar: HANYA "paid" yang
 * diterapkan; kedaluwarsa/batal pada link tidak boleh membatalkan pesanan yang masih menunggu konfirmasi staf.
 */
export function notificationAction(
  o: { payment_mode: string; payment_token: string | null },
  status: string | null,
): NotificationAction {
  if (o.payment_mode === "midtrans") return status ? "apply" : "ignore";
  if (o.payment_mode === "whatsapp" && o.payment_token) return status === "paid" ? "apply" : "ignore";
  return "reject_mode";
}

/** Tautan WhatsApp ke pelanggan dengan teks siap kirim (staf yang menekan kirim; sistem tidak mengirim apa pun). */
export function paymentLinkWhatsapp(o: Pick<LinkOrder, "customer_name" | "order_number" | "total" | "whatsapp">, url: string): { text: string; waUrl: string } {
  const rp = new Intl.NumberFormat("id-ID").format(o.total);
  const text =
    `Halo ${o.customer_name}, pesanan ${o.order_number} sudah kami konfirmasi.\n` +
    `Total Rp ${rp} (sudah termasuk ongkir).\n` +
    `Silakan bayar lewat link ini (QRIS, e-wallet, atau virtual account):\n${url}\n` +
    `Setelah dibayar, pesanan langsung kami proses. Terima kasih!`;
  const digits = o.whatsapp.replace(/\D/g, "");
  return { text, waUrl: `https://wa.me/${digits}?text=${encodeURIComponent(text)}` };
}
