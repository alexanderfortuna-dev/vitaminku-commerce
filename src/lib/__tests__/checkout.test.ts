import { describe, expect, it } from "vitest";
import {
  mapMidtransStatus,
  midtransSignature,
  normalizeWhatsapp,
  resolveModes,
  verifyMidtransSignature,
} from "../checkout-core";
import { buildWhatsappOrderMessage } from "../whatsapp-order";
import { clampQuantity, reconcileWithCatalog, type CartItem } from "@/stores/cartStore";
import { isBuyable, type DbProduct } from "../catalog-db";

const p = (over: Partial<DbProduct> = {}) =>
  ({ id: "1", slug: "whey", name: "Whey", brand: "B", price: 100000, stock: 5, ...over }) as DbProduct;

describe("buyable rule", () => {
  it("needs price > 0 and stock > 0", () => {
    expect(isBuyable(p())).toBe(true);
    expect(isBuyable(p({ price: null }))).toBe(false);
    expect(isBuyable(p({ price: 0 }))).toBe(false);
    expect(isBuyable(p({ stock: 0 }))).toBe(false);
  });
});

describe("cart", () => {
  it("caps quantity at stock and 99", () => {
    expect(clampQuantity(10, 3)).toBe(3);
    expect(clampQuantity(150, 500)).toBe(99);
    expect(clampQuantity(0, 5)).toBe(0);
  });
  it("drops items that are no longer buyable and caps to new stock", () => {
    const items: CartItem[] = [
      { slug: "whey", product: p(), quantity: 4 },
      { slug: "gone", product: p({ slug: "gone" }), quantity: 1 },
    ];
    const r = reconcileWithCatalog(items, [p({ stock: 2 })], ["whey", "gone"]);
    expect(r.items).toEqual([expect.objectContaining({ slug: "whey", quantity: 2 })]);
    expect(r.notices).toHaveLength(2);
  });
});

describe("midtrans signature", () => {
  it("is SHA512(order_id+status_code+gross_amount+server_key)", () => {
    const sig = midtransSignature("VK-1", "200", "125000.00", "key");
    expect(verifyMidtransSignature({ order_id: "VK-1", status_code: "200", gross_amount: "125000.00", signature_key: sig }, "key")).toBe(true);
    expect(verifyMidtransSignature({ order_id: "VK-1", status_code: "200", gross_amount: "1.00", signature_key: sig }, "key")).toBe(false);
    expect(verifyMidtransSignature({ order_id: "VK-1", status_code: "200", gross_amount: "125000.00", signature_key: sig }, "other")).toBe(false);
  });
  it("maps statuses to pending/paid/expired/cancelled", () => {
    expect(mapMidtransStatus("settlement")).toBe("paid");
    expect(mapMidtransStatus("capture", "accept")).toBe("paid");
    expect(mapMidtransStatus("capture", "challenge")).toBe("pending");
    expect(mapMidtransStatus("pending")).toBe("pending");
    expect(mapMidtransStatus("expire")).toBe("expired");
    expect(mapMidtransStatus("cancel")).toBe("cancelled");
    expect(mapMidtransStatus("deny")).toBe("cancelled");
    expect(mapMidtransStatus("refund")).toBeNull();
  });
});

describe("checkout modes", () => {
  it("uses WhatsApp ordering, never a simulated payment, when Midtrans keys are missing", () => {
    expect(resolveModes({})).toEqual({ payment: "whatsapp", shipping: "manual", isProduction: false });
    expect(resolveModes({ MIDTRANS_IS_PRODUCTION: "true" }).payment).toBe("whatsapp");
  });
  it("makes Midtrans primary automatically once the key is added", () => {
    expect(resolveModes({ MIDTRANS_SERVER_KEY: "k", BITESHIP_API_KEY: "b" })).toMatchObject({ payment: "midtrans", shipping: "biteship" });
  });
});

describe("whatsapp order message", () => {
  const base = {
    order_number: "VK-261007-ABC123",
    items: [{ name: "Whey", quantity: 2, unit_price: 125000 }],
    subtotal: 250000,
    shipping_cost: 0,
    shipping_mode: "manual",
    courier_label: "Ongkir dikonfirmasi admin",
    total: 250000,
    customer_name: "Budi",
    whatsapp: "6281234567890",
    address: "Jl. Mawar 1",
    district: "Denpasar Barat",
    city: "Denpasar",
    province: "Bali",
    postal_code: "80228",
  };
  it("lists order number, items name × qty × price, totals and customer", () => {
    const m = buildWhatsappOrderMessage(base);
    expect(m).toContain("No. pesanan: VK-261007-ABC123");
    expect(m).toContain("- Whey × 2 × Rp 125.000");
    expect(m).toContain("Subtotal: Rp 250.000");
    expect(m).toContain("Ongkir: dikonfirmasi cabang");
    expect(m).toContain("Total: Rp 250.000");
    expect(m).toContain("Nama: Budi");
    expect(m).toContain("WhatsApp: 6281234567890");
    expect(m).toContain("Jl. Mawar 1, Denpasar Barat, Denpasar, Bali 80228");
  });
  it("shows the courier price when shipping is calculated", () => {
    const m = buildWhatsappOrderMessage({ ...base, shipping_mode: "biteship", shipping_cost: 15000, courier_label: "JNE REG", total: 265000 });
    expect(m).toContain("Ongkir: Rp 15.000 (JNE REG)");
    expect(m).toContain("Total: Rp 265.000");
  });
});

describe("whatsapp", () => {
  it("normalizes Indonesian numbers", () => {
    expect(normalizeWhatsapp("0813-3995-0000")).toBe("6281339950000");
    expect(normalizeWhatsapp("+62 813 3995 0000")).toBe("6281339950000");
    expect(normalizeWhatsapp("12345")).toBeNull();
  });
});
