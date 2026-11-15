import { describe, expect, it } from "vitest";
import {
  ACTIVATION_ATTEMPT_LIMIT,
  ACTIVATION_LOCKED_MESSAGE,
  ACTIVATION_MISMATCH_MESSAGE,
  ACTIVATION_UNAVAILABLE_MESSAGE,
  BOOTSTRAP_SECRET_MISSING,
  BOOTSTRAP_SECRET_TOO_SHORT,
  activationClientIp,
  assertActivationAllowed,
  assertBootstrapSecret,
  rejectMismatchedBootstrap,
  type RateRpcResult,
} from "../activation-limit";

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name] ?? null };
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

describe("batas aktivasi lintas instance", () => {
  it("20 kode salah berturut-turut lalu percobaan berikutnya terkunci", async () => {
    const { hits, rpc } = countingRpc();
    for (let i = 1; i <= ACTIVATION_ATTEMPT_LIMIT; i++) {
      await assertActivationAllowed({
        kind: "owner",
        headers: headers({ "cf-connecting-ip": `203.0.113.${i}`, "x-vercel-forwarded-for": "198.51.100.8" }),
        rpc,
        env: {},
      });
      expect(() => rejectMismatchedBootstrap(false, false)).toThrow(ACTIVATION_MISMATCH_MESSAGE);
    }
    await expect(
      assertActivationAllowed({
        kind: "owner",
        headers: headers({ "cf-connecting-ip": "203.0.113.99", "x-vercel-forwarded-for": "198.51.100.8" }),
        rpc,
        env: {},
      }),
    ).rejects.toThrow(ACTIVATION_LOCKED_MESSAGE);
    expect(hits.size).toBe(1);
  });

  it("pesan salah tidak membedakan email dan kode", () => {
    for (const [emailOk, codeOk] of [
      [false, true],
      [true, false],
      [false, false],
    ] as const) {
      expect(() => rejectMismatchedBootstrap(emailOk, codeOk)).toThrow(ACTIVATION_MISMATCH_MESSAGE);
    }
    expect(() => rejectMismatchedBootstrap(true, true)).not.toThrow();
    expect(ACTIVATION_MISMATCH_MESSAGE).not.toMatch(/kode salah|email salah|kode benar|email benar/i);
    expect(ACTIVATION_LOCKED_MESSAGE).not.toMatch(/kode salah|email salah|kode benar|email benar/i);
  });

  it("rahasia bootstrap lebih pendek dari batas ditolak dengan pesan jelas", () => {
    expect(() => assertBootstrapSecret(undefined)).toThrow(BOOTSTRAP_SECRET_MISSING);
    expect(() => assertBootstrapSecret("pendek")).toThrow(BOOTSTRAP_SECRET_TOO_SHORT);
    expect(assertBootstrapSecret("a".repeat(16))).toHaveLength(16);
  });

  it("RPC error menolak aktivasi", async () => {
    const rpc = async (): Promise<RateRpcResult> => ({ allowed: null, error: "db down" });
    await expect(
      assertActivationAllowed({ kind: "staff", headers: headers({ "x-forwarded-for": "198.51.100.8" }), rpc, env: {} }),
    ).rejects.toThrow(ACTIVATION_UNAVAILABLE_MESSAGE);
  });

  it("header Cloudflare palsu tidak memindahkan ember", () => {
    const env = {};
    const a = activationClientIp(headers({ "cf-connecting-ip": "1.1.1.1", "x-vercel-forwarded-for": "198.51.100.8" }), env);
    const b = activationClientIp(headers({ "cf-connecting-ip": "8.8.8.8", "x-vercel-forwarded-for": "198.51.100.8" }), env);
    expect(a).toBe(b);
    expect(activationClientIp(headers({ "cf-connecting-ip": "1.1.1.1" }), { TRUST_CLOUDFLARE_IP: "true" })).toBe("1.1.1.1");
  });
});
