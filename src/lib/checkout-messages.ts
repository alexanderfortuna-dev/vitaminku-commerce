/** Pesan checkout yang dilihat pelanggan. Tanpa impor Node, aman untuk UI. */

export const MANUAL_ONLINE_PAYMENT_MESSAGE =
  "Ongkir dikonfirmasi cabang dulu; pesan via WhatsApp.";

export const ESTIMATED_SHIPPING_NOTICE =
  "Ongkir perkiraan; cabang mengonfirmasi final via WhatsApp.";

export const PAYMENT_LINK_FAILED_MESSAGE =
  "Pembayaran gagal disiapkan. Keranjangmu tetap utuh. Coba lagi untuk mendapat tautan bayar, atau pesan via WhatsApp.";

export const ORDER_CONTENT_CHANGED_MESSAGE =
  "Isi pesanan berubah sejak percobaan sebelumnya. Muat ulang halaman, lalu kirim lagi.";

/** Bayar online hanya bila ongkir sudah pasti (bukan mode manual bertarif 0). */
export function assertOnlinePaymentAllowed(
  method: "midtrans" | "whatsapp",
  shippingMode: "biteship" | "manual" | "mock",
): void {
  if (method === "midtrans" && shippingMode === "manual") {
    throw new Error(MANUAL_ONLINE_PAYMENT_MESSAGE);
  }
}

export interface AttemptFingerprintInput {
  lines: Array<{ slug: string; quantity: number }>;
  name: string;
  whatsapp: string;
  address: string;
  branchId: string | null;
  method: string;
  promoCode: string | null;
  courier: { company: string; service: string };
  area: { id: string; postal_code: string } | null;
  note: string;
}

/** Sidik jari percobaan pesan. Kurir, area, dan catatan ikut, jadi isi baru mendapat kunci baru. */
export function checkoutAttemptFingerprint(input: AttemptFingerprintInput): string {
  return JSON.stringify([
    input.lines,
    input.name,
    input.whatsapp,
    input.address,
    input.branchId,
    input.method,
    input.promoCode,
    input.courier.company,
    input.courier.service,
    input.area ? [input.area.id, input.area.postal_code] : null,
    input.note.trim(),
  ]);
}

export interface StoredOrderAttempt {
  courier_company: string | null;
  courier_service: string | null;
  area_id: string | null;
  postal_code: string | null;
  payment_mode: string | null;
  customer_note: string | null;
  items: Array<{ slug: string; quantity: number }>;
}

export interface FreshOrderAttempt {
  courier: { company: string; service: string };
  areaId: string;
  postalCode: string;
  paymentMode: string;
  note: string | null;
  lines: Array<{ slug: string; quantity: number }>;
}

/** Catatan staf menambahkan tanda dalam kurung sesudah (atau sebagai pengganti) catatan pelanggan. */
function customerNoteBody(stored: string | null): string {
  let text = (stored ?? "").trim();
  if (text.startsWith("[")) {
    const end = text.indexOf("]");
    text = end === -1 ? text : text.slice(end + 1).trim();
  }
  const mark = text.indexOf(" [");
  return (mark === -1 ? text : text.slice(0, mark)).trim();
}

/**
 * Kunci idempotensi yang sama hanya boleh mengembalikan pesanan lama bila isi yang menentukan
 * harga dan tujuan sama. Kurir, area, catatan, metode, dan barang yang beda = bukan kirim ulang.
 */
export function checkoutPayloadAgrees(stored: StoredOrderAttempt, fresh: FreshOrderAttempt): boolean {
  if ((stored.courier_company ?? "") !== fresh.courier.company) return false;
  if ((stored.courier_service ?? "") !== fresh.courier.service) return false;
  if ((stored.area_id ?? "") !== fresh.areaId) return false;
  if ((stored.postal_code ?? "") !== fresh.postalCode) return false;
  if ((stored.payment_mode ?? "") !== fresh.paymentMode) return false;
  if (customerNoteBody(stored.customer_note) !== (fresh.note ?? "").trim()) return false;
  const a = stored.items.map((i) => `${i.slug}:${i.quantity}`).sort();
  const b = fresh.lines.map((l) => `${l.slug}:${l.quantity}`).sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function ensureSnapLink(opts: {
  existingUrl: string | null;
  createSnap: () => Promise<{ token?: string; redirect_url?: string }>;
}): Promise<{ url: string; token: string | null }> {
  if (opts.existingUrl) return { url: opts.existingUrl, token: null };
  try {
    const snap = await opts.createSnap();
    if (!snap.redirect_url) throw new Error(PAYMENT_LINK_FAILED_MESSAGE);
    return { url: snap.redirect_url, token: snap.token ?? null };
  } catch (e) {
    if (e instanceof Error && e.message === PAYMENT_LINK_FAILED_MESSAGE) throw e;
    throw new Error(PAYMENT_LINK_FAILED_MESSAGE);
  }
}
