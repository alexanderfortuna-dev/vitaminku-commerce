/**
 * Normalized VitaminKu order status vocabulary.
 *
 * INACTIVE SCAFFOLD — nothing renders these yet. Customer order lookup and
 * tracking cannot be built until an authenticated order source exists:
 * either Shopify Customer Accounts or a valid Shopify Admin API key
 * (secret name SHOPIFY_ADMIN_ACCESS_TOKEN). Until then no order UI is shown,
 * so the storefront never displays an invented status.
 *
 * Payment and fulfillment stay separate dimensions on purpose: a paid order is
 * never reported as delivered, an authorized order never as captured, a
 * partially refunded order never as fully refunded, a fulfilled order never as
 * delivered, and an unrecognised Shopify value maps to UNKNOWN rather than a
 * guess.
 */

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "READY_FOR_DELIVERY"
  | "COURIER_ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PAYMENT_FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DELIVERY_FAILED"
  | "UNKNOWN";

/** Customer-facing Indonesian labels for the delivery journey. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Menunggu pembayaran",
  PAID: "Pesanan diterima",
  PROCESSING: "Sedang disiapkan",
  READY_FOR_DELIVERY: "Siap dikirim",
  COURIER_ASSIGNED: "Kurir ditugaskan",
  OUT_FOR_DELIVERY: "Dalam perjalanan",
  DELIVERED: "Terkirim",
  PAYMENT_FAILED: "Pembayaran gagal",
  CANCELLED: "Dibatalkan",
  REFUNDED: "Dana dikembalikan",
  PARTIALLY_REFUNDED: "Dana dikembalikan sebagian",
  DELIVERY_FAILED: "Pengiriman gagal",
  UNKNOWN: "Status belum tersedia",
};

/** Ordered delivery steps shown to the customer once real evidence exists. */
export const DELIVERY_STEPS: OrderStatus[] = [
  "PAID",
  "PROCESSING",
  "COURIER_ASSIGNED",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export interface ShopifyOrderSignals {
  /** Shopify displayFinancialStatus, e.g. PENDING, PAID, REFUNDED. */
  financialStatus?: string | null;
  /** Shopify displayFulfillmentStatus, e.g. UNFULFILLED, FULFILLED. */
  fulfillmentStatus?: string | null;
  /** Shopify fulfillment displayStatus, e.g. IN_TRANSIT, DELIVERED. */
  fulfillmentDisplayStatus?: string | null;
  cancelledAt?: string | null;
}

/**
 * Maps real Shopify signals to one normalized status. Intermediate steps are
 * never invented: without fulfillment evidence an order stays at PAID/PROCESSING.
 */
export function normalizeOrderStatus(signals: ShopifyOrderSignals): OrderStatus {
  const financial = (signals.financialStatus ?? "").toUpperCase();
  const fulfillment = (signals.fulfillmentStatus ?? "").toUpperCase();
  const delivery = (signals.fulfillmentDisplayStatus ?? "").toUpperCase();

  if (signals.cancelledAt) return "CANCELLED";
  if (financial === "REFUNDED") return "REFUNDED";
  if (financial === "PARTIALLY_REFUNDED") return "PARTIALLY_REFUNDED";
  if (financial === "VOIDED" || financial === "EXPIRED") return "PAYMENT_FAILED";

  // Delivery evidence only counts when Shopify itself reports it.
  if (delivery === "DELIVERED") return "DELIVERED";
  if (delivery === "FAILURE" || delivery === "DELIVERY_FAILED") return "DELIVERY_FAILED";
  if (delivery === "OUT_FOR_DELIVERY" || delivery === "IN_TRANSIT") return "OUT_FOR_DELIVERY";
  if (delivery === "READY_FOR_PICKUP" || delivery === "LABEL_PRINTED") return "READY_FOR_DELIVERY";
  if (delivery === "ATTEMPTED_DELIVERY") return "OUT_FOR_DELIVERY";

  if (fulfillment === "FULFILLED" || fulfillment === "PARTIALLY_FULFILLED") {
    return "READY_FOR_DELIVERY";
  }
  if (fulfillment === "IN_PROGRESS") return "PROCESSING";

  if (financial === "PAID") return "PAID";
  if (financial === "AUTHORIZED" || financial === "PENDING" || financial === "PARTIALLY_PAID") {
    return "PENDING_PAYMENT";
  }
  return "UNKNOWN";
}
