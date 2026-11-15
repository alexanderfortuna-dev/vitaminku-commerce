import { describe, expect, it } from "vitest";
import {
  ORDER_RATE_LIMIT,
  ORDER_RATE_LIMIT_MESSAGE,
  clientIpFrom,
  purposeVisitorHash,
  rateLimitSubject,
} from "../checkout-core";
import {
  ESTIMATED_SHIPPING_NOTICE,
  MANUAL_ONLINE_PAYMENT_MESSAGE,
  PAYMENT_LINK_FAILED_MESSAGE,
  assertOnlinePaymentAllowed,
  checkoutAttemptFingerprint,
  checkoutPayloadAgrees,
  ensureSnapLink,
} from "../checkout-messages";
import { enforceOrderRateLimit, RATE_LIMIT_UNAVAILABLE_MESSAGE, type RateRpcResult } from "../rate-limit.server";

const baseAttempt = {
  lines: [{ slug: "whey", quantity: 1 }],
  name: "Sari",
  whatsapp: "081234567890",
  address: "Jl. Danau Tamblingan No. 10",
  branchId: "11111111-1111-1111-1111-111111111111",
  method: "whatsapp",
  promoCode: null,
  courier: { company: "jne", service: "reg" },
  area: { id: "AREA1", postal_code: "80228" },
  note: "titip satpam",
};

describe("bayar online ditolak bila ongkir manual", () => {
  it("method midtrans + ongkir manual melempar pesan cabang", () => {
    expect(() => assertOnlinePaymentAllowed("midtrans", "manual")).toThrow(MANUAL_ONLINE_PAYMENT_MESSAGE);
  });
  it("WhatsApp dan ongkir kurir tetap diizinkan", () => {
    expect(() => assertOnlinePaymentAllowed("whatsapp", "manual")).not.toThrow();
    expect(() => assertOnlinePaymentAllowed("midtrans", "biteship")).not.toThrow();
  });
});

describe("tautan bayar Snap", () => {
  it("gagal lalu berhasil: tidak pernah mengembalikan sukses tanpa tautan", async () => {
    let calls = 0;
    const createSnap = async () => {
      calls += 1;
      if (calls === 1) throw new Error("Midtrans down");
      return { token: "tok", redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/tok" };
    };
    await expect(ensureSnapLink({ existingUrl: null, createSnap })).rejects.toThrow(PAYMENT_LINK_FAILED_MESSAGE);
    const second = await ensureSnapLink({ existingUrl: null, createSnap });
    expect(second.url).toMatch(/^https:\/\/app\.sandbox\.midtrans\.com/);
    const again = await ensureSnapLink({ existingUrl: second.url, createSnap });
    expect(again.url).toBe(second.url);
    expect(calls).toBe(2);
  });
});

describe("kunci idempotensi terikat isi", () => {
  it("kurir, area, atau catatan yang berubah menghasilkan sidik jari baru", () => {
    const a = checkoutAttemptFingerprint(baseAttempt);
    expect(checkoutAttemptFingerprint(baseAttempt)).toBe(a);
    expect(checkoutAttemptFingerprint({ ...baseAttempt, courier: { company: "jnt", service: "ez" } })).not.toBe(a);
    expect(checkoutAttemptFingerprint({ ...baseAttempt, area: { id: "AREA2", postal_code: "80361" } })).not.toBe(a);
    expect(checkoutAttemptFingerprint({ ...baseAttempt, note: "lantai 2" })).not.toBe(a);
  });
  it("kunci sama tetapi kurir beda tidak dianggap pesanan yang sama", () => {
    const stored = {
      courier_company: "jne",
      courier_service: "reg",
      area_id: "AREA1",
      postal_code: "80228",
      payment_mode: "whatsapp",
      customer_note: "titip satpam [Ongkir perkiraan; cabang mengonfirmasi final via WhatsApp.]",
      items: [{ slug: "whey", quantity: 1 }],
    };
    const fresh = {
      courier: { company: "jne", service: "reg" },
      areaId: "AREA1",
      postalCode: "80228",
      paymentMode: "whatsapp",
      note: "titip satpam",
      lines: [{ slug: "whey", quantity: 1 }],
    };
    expect(checkoutPayloadAgrees(stored, fresh)).toBe(true);
    expect(checkoutPayloadAgrees(stored, { ...fresh, courier: { company: "jnt", service: "ez" } })).toBe(false);
    expect(checkoutPayloadAgrees({ ...stored, customer_note: "[Ongkir perkiraan; cabang mengonfirmasi final via WhatsApp.]" }, { ...fresh, note: null })).toBe(true);
  });
});

describe("ongkir perkiraan", () => {
  it("teks pelanggan tetap, tanpa mengarang berat", () => {
    expect(ESTIMATED_SHIPPING_NOTICE).toBe("Ongkir perkiraan; cabang mengonfirmasi final via WhatsApp.");
    expect(ESTIMATED_SHIPPING_NOTICE).not.toMatch(/\d+\s*g/);
  });
});

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? map[name] ?? null };
}

function countingRpc() {
  const hits = new Map<string, number>();
  const rpc = async (visitor: string, limit: number): Promise<RateRpcResult> => {
    const n = hits.get(visitor) ?? 0;
    if (n >= limit) return { allowed: false, error: null };
    hits.set(visitor, n + 1);
    return { allowed: true, error: null };
  };
  return { hits, rpc };
}

describe("batas laju pesanan", () => {
  it("21 permintaan dengan cf-connecting-ip berganti-ganti: permintaan ke-21 tetap ditolak", async () => {
    const { hits, rpc } = countingRpc();
    for (let i = 1; i <= 21; i++) {
      const h = headers({
        "cf-connecting-ip": `203.0.113.${i}`,
        "x-vercel-forwarded-for": "198.51.100.10",
        "user-agent": "vitamin-test",
      });
      if (i <= ORDER_RATE_LIMIT) await enforceOrderRateLimit(h, rpc);
      else await expect(enforceOrderRateLimit(h, rpc)).rejects.toThrow(ORDER_RATE_LIMIT_MESSAGE);
    }
    expect(hits.size).toBe(1);
    expect(clientIpFrom(headers({ "cf-connecting-ip": "203.0.113.1", "x-vercel-forwarded-for": "198.51.100.10" }), {})).toBe("198.51.100.10");
  });
  it("tanpa IP tepercaya berbagi satu ember dan tidak lolos tanpa batas", async () => {
    const { hits, rpc } = countingRpc();
    const a = await purposeVisitorHash("order", rateLimitSubject(headers({ "cf-connecting-ip": "1.1.1.1" }), {}).ip, "");
    const b = await purposeVisitorHash("order", rateLimitSubject(headers({ "cf-connecting-ip": "2.2.2.2" }), {}).ip, "");
    expect(a).toBe(b);
    for (let i = 0; i < ORDER_RATE_LIMIT; i++) await enforceOrderRateLimit(headers({ "cf-connecting-ip": `${i}.0.0.1` }), rpc);
    await expect(enforceOrderRateLimit(headers({ "cf-connecting-ip": "9.9.9.9" }), rpc)).rejects.toThrow(ORDER_RATE_LIMIT_MESSAGE);
    expect(hits.size).toBe(1);
  });
  it("RPC error menolak pesanan, tidak membukanya", async () => {
    const rpc = async (): Promise<RateRpcResult> => ({ allowed: null, error: "db down" });
    await expect(enforceOrderRateLimit(headers({ "x-vercel-forwarded-for": "198.51.100.10" }), rpc)).rejects.toThrow(
      RATE_LIMIT_UNAVAILABLE_MESSAGE,
    );
  });
});
