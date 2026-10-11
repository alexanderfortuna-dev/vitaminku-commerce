import { describe, expect, it } from "vitest";
import { normalizeBranchWhatsapp, pickBranchNumber } from "../store-core";
import { buildWhatsappOrderMessage } from "../whatsapp-order";

describe("branch WhatsApp", () => {
  it("normalizes the two default numbers", () => {
    expect(normalizeBranchWhatsapp("+62 813-3995-0000")).toBe("6281339950000");
    expect(normalizeBranchWhatsapp("0821 4773 9996")).toBe("6282147739996");
    expect(normalizeBranchWhatsapp("12345")).toBeNull();
  });
  it("routes to the chosen active branch, else the main number", () => {
    const b = [{ id: "a", whatsapp: "6282147739996", is_active: true }, { id: "x", whatsapp: "6280000000000", is_active: false }];
    expect(pickBranchNumber(b, "a").whatsapp).toBe("6282147739996");
    expect(pickBranchNumber(b, "x").whatsapp).toBe("6281339950000");
  });
  it("puts the branch in the order message", () => {
    const msg = buildWhatsappOrderMessage({
      order_number: "VK-1", items: [{ name: "Whey", quantity: 2, unit_price: 125000 }], subtotal: 250000, shipping_cost: 0,
      shipping_mode: "manual", courier_label: "x", total: 250000, customer_name: "Budi", whatsapp: "62811", address: "Jl A",
      district: "D", city: "C", province: "P", postal_code: "80228", branch_name: "Denpasar",
    });
    expect(msg).toContain("Cabang: Denpasar");
    expect(msg).toContain("Whey × 2 × Rp 125.000");
  });
});
