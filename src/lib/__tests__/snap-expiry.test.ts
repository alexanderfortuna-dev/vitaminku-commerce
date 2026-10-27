import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSnapTransaction } from "../checkout.server";

const base = {
  orderNumber: "VK-1", midtransOrderId: "VK-1~ab12", expiryHours: 24, total: 215000,
  items: [{ id: "A", name: "Whey", price: 215000, quantity: 1 }],
  customer: { name: "Budi", phone: "6281234567890", address: "Jl. Uji 1", city: "Denpasar", postal_code: "80228" },
  finishUrl: "https://vitaminku.test/pesanan/x",
};
let bodies: Array<Record<string, unknown>>;
const stub = (...answers: Array<{ status: number; json: unknown }>) => {
  const queue = [...answers];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const a = queue.shift()!;
    return new Response(JSON.stringify(a.json), { status: a.status });
  }));
};

beforeEach(() => {
  bodies = [];
  vi.stubEnv("MIDTRANS_SERVER_KEY", "SB-Mid-server-test");
  vi.stubEnv("MIDTRANS_IS_PRODUCTION", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Snap untuk link bayar staf", () => {
  it("memakai order_id per percobaan, jumlah dari total, dan masa berlaku 24 jam", async () => {
    stub({ status: 201, json: { token: "tok", redirect_url: "https://pay" } });
    const r = await createSnapTransaction(base);
    expect(r).toEqual({ token: "tok", redirect_url: "https://pay" });
    expect(bodies[0]).toMatchObject({ transaction_details: { order_id: "VK-1~ab12", gross_amount: 215000 }, expiry: { unit: "hour", duration: 24 } });
  });
  it("Midtrans menolak parameter expiry → diulang sekali tanpa expiry, link tetap jadi", async () => {
    stub({ status: 400, json: { error_messages: ["expiry.unit is invalid"] } }, { status: 201, json: { token: "t2", redirect_url: "https://pay2" } });
    const r = await createSnapTransaction(base);
    expect(r.token).toBe("t2");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!["expiry"]).toBeDefined();
    expect(bodies[1]!["expiry"]).toBeUndefined();
    expect(bodies[1]).toMatchObject({ transaction_details: { order_id: "VK-1~ab12" } });
  });
  it("galat lain (bukan soal expiry) tidak diulang dan dilaporkan jelas", async () => {
    stub({ status: 400, json: { error_messages: ["transaction_details.order_id has already been taken"] } });
    await expect(createSnapTransaction(base)).rejects.toThrow(/Pembayaran gagal disiapkan/);
    expect(bodies).toHaveLength(1);
  });
  it("alur pelanggan biasa tidak mengirim expiry dan memakai nomor pesanan sebagai order_id", async () => {
    stub({ status: 201, json: { token: "t", redirect_url: "u" } });
    await createSnapTransaction({ orderNumber: "VK-9", total: 1000, items: base.items, customer: base.customer, finishUrl: base.finishUrl });
    expect(bodies[0]!["expiry"]).toBeUndefined();
    expect(bodies[0]).toMatchObject({ transaction_details: { order_id: "VK-9" } });
  });
});
