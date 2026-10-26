import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { midtransSignature } from "../checkout-core";

const KEY = "SB-Mid-server-test";
let order: { id: string; total: number; payment_mode: string; payment_token: string | null } | null;
let lookedUp: string | null;
const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: "paid", error: null }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => {
          lookedUp = val;
          return { maybeSingle: async () => ({ data: order, error: null }) };
        },
      }),
    }),
    rpc: (name: string, args: Record<string, unknown>) => rpc(name, args),
  },
}));

function note(over: Record<string, string> = {}) {
  const n = { order_id: "VK-1", status_code: "200", gross_amount: "215000.00", transaction_status: "settlement", ...over };
  return { ...n, signature_key: midtransSignature(n.order_id, n.status_code, n.gross_amount, KEY) };
}

beforeEach(() => {
  vi.stubEnv("MIDTRANS_SERVER_KEY", KEY);
  rpc.mockClear();
  lookedUp = null;
  order = { id: "o1", total: 215000, payment_mode: "whatsapp", payment_token: "tok" };
});
afterEach(() => vi.unstubAllEnvs());

describe("webhook Midtrans untuk pesanan WhatsApp dengan link bayar", async () => {
  const { processNotification } = await import("../checkout.server");

  it("settlement bertanda tangan + jumlah cocok → status paid diterapkan lewat apply_order_payment_status", async () => {
    const r = await processNotification(note());
    expect(r).toEqual({ ok: true, result: "paid" });
    expect(rpc).toHaveBeenCalledWith("apply_order_payment_status", { _order_id: "o1", _status: "paid", _transaction_status: "settlement" });
  });
  it("order_id dengan akhiran percobaan (VK-1~ab12) tetap menemukan pesanan VK-1", async () => {
    const r = await processNotification(note({ order_id: "VK-1~ab12" }));
    expect(r.ok).toBe(true);
    expect(lookedUp).toBe("VK-1");
  });
  it("link kedaluwarsa/batal tidak membatalkan pesanan WhatsApp (diabaikan, RPC tidak dipanggil)", async () => {
    for (const t of ["expire", "cancel", "deny"]) {
      const r = await processNotification(note({ transaction_status: t }));
      expect(r).toEqual({ ok: true, result: "ignored" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("jumlah tidak cocok → 400 dan tidak diterapkan", async () => {
    const r = await processNotification(note({ gross_amount: "1000.00" }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("tanda tangan salah → 401", async () => {
    const r = await processNotification({ ...note(), signature_key: "x".repeat(128) });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
  it("pesanan WhatsApp tanpa link → 409 seperti sebelumnya", async () => {
    order = { id: "o1", total: 215000, payment_mode: "whatsapp", payment_token: null };
    expect(await processNotification(note())).toMatchObject({ ok: false, status: 409 });
  });
  it("pesanan Midtrans biasa: kedaluwarsa tetap diterapkan (perilaku lama tidak berubah)", async () => {
    order = { id: "o2", total: 215000, payment_mode: "midtrans", payment_token: "t" };
    rpc.mockResolvedValueOnce({ data: "expired", error: null });
    const r = await processNotification(note({ transaction_status: "expire" }));
    expect(r).toEqual({ ok: true, result: "expired" });
    expect(rpc).toHaveBeenCalledWith("apply_order_payment_status", { _order_id: "o2", _status: "expired", _transaction_status: "expire" });
  });
});
