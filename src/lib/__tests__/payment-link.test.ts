import { describe, expect, it } from "vitest";
import { MSG_MIDTRANS_OFF, linkGate, notificationAction, paymentLinkWhatsapp, snapItemsFromOrder, type LinkOrder } from "../payment-link";

const order = (over: Partial<LinkOrder> = {}): LinkOrder => ({
  id: "o1", order_number: "VK-1", status: "menunggu_konfirmasi", payment_mode: "whatsapp", shipping_mode: "manual", shipping_cost: 25000,
  subtotal: 200000, discount_total: 10000, total: 215000, promo_code: "HEMAT10", payment_token: null, payment_url: null,
  customer_name: "Budi", whatsapp: "6281234567890",
  items: [{ sku: "A", name: "Whey", unit_price: 150000, quantity: 1 }, { sku: "B", name: "Creatine", unit_price: 50000, quantity: 1 }], ...over,
});

describe("link bayar: gerbang", () => {
  it("tanpa kunci Midtrans: pesan jelas, tidak ada link", () => {
    expect(linkGate(order(), false)).toEqual({ ok: false, message: MSG_MIDTRANS_OFF });
  });
  it("pesanan menunggu konfirmasi/pending boleh; lunas, batal, kedaluwarsa tidak", () => {
    expect(linkGate(order(), true)).toEqual({ ok: true, reuse: false });
    expect(linkGate(order({ status: "pending" }), true)).toEqual({ ok: true, reuse: false });
    for (const s of ["paid", "cancelled", "expired"]) expect(linkGate(order({ status: s }), true).ok).toBe(false);
  });
  it("klik dua kali = token yang sama (link tersimpan dipakai ulang)", () => {
    const g = linkGate(order({ payment_token: "tok", payment_url: "https://pay" }), true);
    expect(g).toEqual({ ok: true, reuse: true });
  });
  it("total nol ditolak", () => {
    expect(linkGate(order({ total: 0 }), true).ok).toBe(false);
  });
});

describe("link bayar: jumlah selalu dari database", () => {
  it("rincian Midtrans = barang + ongkir − diskon = total pesanan (215.000)", () => {
    const items = snapItemsFromOrder(order());
    expect(items.reduce((n, i) => n + i.price * i.quantity, 0)).toBe(215000);
    expect(items.map((i) => i.id)).toEqual(["A", "B", "ONGKIR", "DISKON"]);
  });
  it("total tidak cocok dengan rincian (data rusak/dimanipulasi) → ditolak, tidak ada tagihan salah", () => {
    expect(() => snapItemsFromOrder(order({ total: 1 }))).toThrow(/tidak cocok/);
    expect(() => snapItemsFromOrder(order({ shipping_cost: 0 }))).toThrow(/tidak cocok/);
  });
  it("ongkir 0 dan tanpa diskon: tanpa baris tambahan", () => {
    const items = snapItemsFromOrder(order({ shipping_cost: 0, discount_total: 0, total: 200000 }));
    expect(items.map((i) => i.id)).toEqual(["A", "B"]);
  });
});

describe("webhook: pesanan WhatsApp dengan link", () => {
  it("pesanan Midtrans biasa: perilaku lama (semua status diterapkan)", () => {
    expect(notificationAction({ payment_mode: "midtrans", payment_token: "t" }, "expired")).toBe("apply");
    expect(notificationAction({ payment_mode: "midtrans", payment_token: "t" }, null)).toBe("ignore");
  });
  it("WhatsApp + link: hanya paid yang diterapkan; kedaluwarsa/batal diabaikan (pesanan tidak ikut batal)", () => {
    const o = { payment_mode: "whatsapp", payment_token: "t" };
    expect(notificationAction(o, "paid")).toBe("apply");
    for (const s of ["expired", "cancelled", "pending", null] as const) expect(notificationAction(o, s)).toBe("ignore");
  });
  it("WhatsApp tanpa link, atau mode lain: ditolak seperti sebelumnya", () => {
    expect(notificationAction({ payment_mode: "whatsapp", payment_token: null }, "paid")).toBe("reject_mode");
    expect(notificationAction({ payment_mode: "mock", payment_token: "t" }, "paid")).toBe("reject_mode");
  });
});

describe("teks WhatsApp untuk staf", () => {
  it("memuat nama, nomor pesanan, total berformat, link; tautan wa.me ke nomor pelanggan", () => {
    const { text, waUrl } = paymentLinkWhatsapp(order(), "https://app.midtrans.com/snap/v4/redirection/abc");
    expect(text).toContain("Budi");
    expect(text).toContain("VK-1");
    expect(text).toContain("215.000");
    expect(text).toContain("https://app.midtrans.com/snap/v4/redirection/abc");
    expect(waUrl.startsWith("https://wa.me/6281234567890?text=")).toBe(true);
  });
});
