// Browser-safe WhatsApp order message (shared by checkout, order page and tests).
export const MANUAL_SHIPPING_LABEL = "Ongkir dikonfirmasi cabang via WhatsApp";

export interface WhatsappOrderInput {
  order_number: string;
  items: Array<{ name: string; quantity: number; unit_price: number }>;
  subtotal: number;
  shipping_cost: number;
  discount_total?: number | null;
  promo_code?: string | null;
  note?: string | null;
  shipping_mode: string;
  courier_label: string;
  total: number;
  customer_name: string;
  whatsapp: string;
  address: string;
  district: string;
  city: string;
  province: string;
  postal_code: string;
  branch_name?: string | null;
}

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID").replace(/,/g, ".");

/** Prefilled Indonesian WhatsApp order message. */
export function buildWhatsappOrderMessage(o: WhatsappOrderInput): string {
  const manual = o.shipping_mode === "manual";
  return [
    `Halo VitaminKu, saya ingin memesan.`,
    ``,
    `No. pesanan: ${o.order_number}`,
    ...(o.branch_name ? [`Cabang: ${o.branch_name}`] : []),
    ...o.items.map((i) => `- ${i.name} × ${i.quantity} × ${rp(i.unit_price)}`),
    ``,
    `Subtotal: ${rp(o.subtotal)}`,
    ...(o.discount_total ? [`Diskon${o.promo_code ? ` (${o.promo_code})` : ""}: -${rp(o.discount_total)}`] : []),
    `Ongkir: ${manual ? "dikonfirmasi cabang" : `${rp(o.shipping_cost)} (${o.courier_label})`}`,
    `Total: ${rp(o.total)}${manual ? " + ongkir" : ""}`,
    ``,
    `Nama: ${o.customer_name}`,
    `WhatsApp: ${o.whatsapp}`,
    `Alamat: ${[o.address, o.district, o.city, `${o.province} ${o.postal_code}`.trim()].filter(Boolean).join(", ")}`,
    ...(o.note ? [`Catatan: ${o.note}`] : []),
  ].join("\n");
}

export function whatsappOrderUrl(number: string, o: WhatsappOrderInput): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsappOrderMessage(o))}`;
}

