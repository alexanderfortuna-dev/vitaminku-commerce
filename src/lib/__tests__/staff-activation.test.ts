import { describe, expect, it } from "vitest";
import {
  STAFF_GRANTS,
  expiryFromDays,
  makeStaffCode,
  verifyStaffCode,
  type StaffGrant,
} from "../staff-activation.server";
import { formatExpiryId } from "../staff-activation-format";

const SECRET = "uji-rahasia-aktivasi-staf-0123456789abcdef";
const EMAIL = "staf.satu@example.com";
const ADMIN: StaffGrant = { role: "admin", title: "admin" };
const NOW = new Date("2026-10-21T02:00:00+07:00");

describe("kode aktivasi staf", () => {
  const expiresOn = expiryFromDays(14, NOW);
  const code = makeStaffCode({ secret: SECRET, email: EMAIL, grant: ADMIN, expiresOn });

  it("bentuk kode terbaca manusia dan tanggal berlaku 14 hari (WIB)", () => {
    expect(expiresOn).toBe("20261104");
    expect(code).toMatch(/^VK-20261104(-[A-HJ-NP-Z2-9]{5}){4}$/);
  });

  it("kode benar -> peran admin; huruf kecil dan spasi tetap diterima", () => {
    const res = verifyStaffCode({ secret: SECRET, email: EMAIL, code, now: NOW });
    expect(res).toEqual({ ok: true, grant: ADMIN, expiresOn: "20261104" });
    const sloppy = verifyStaffCode({ secret: SECRET, email: `  ${EMAIL.toUpperCase()} `, code: code.toLowerCase().replace(/-/g, " "), now: NOW });
    expect(sloppy.ok).toBe(true);
  });

  it("terikat ke email: email lain ditolak", () => {
    const res = verifyStaffCode({ secret: SECRET, email: "orang.lain@example.com", code, now: NOW });
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("terikat ke peran: setiap kombinasi peran menghasilkan kode berbeda dan peran tidak bisa dinaikkan", () => {
    const codes = STAFF_GRANTS.map((grant) => makeStaffCode({ secret: SECRET, email: EMAIL, grant, expiresOn }));
    expect(new Set(codes).size).toBe(STAFF_GRANTS.length);
    codes.forEach((c, i) => {
      const res = verifyStaffCode({ secret: SECRET, email: EMAIL, code: c, now: NOW });
      expect(res.ok && res.grant).toEqual(STAFF_GRANTS[i]);
    });
  });

  it("tidak ada kode untuk peran owner", () => {
    expect(STAFF_GRANTS.some((g) => (g.role as string) === "owner")).toBe(false);
  });

  it("rahasia lain, tanggal diubah, atau huruf diubah -> ditolak", () => {
    expect(verifyStaffCode({ secret: SECRET + "x", email: EMAIL, code, now: NOW }).ok).toBe(false);
    expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code: code.replace("20261104", "20261204"), now: NOW }).ok).toBe(false);
    const flipped = code.slice(0, -1) + (code.endsWith("A") ? "B" : "A");
    expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code: flipped, now: NOW }).ok).toBe(false);
  });

  it("kedaluwarsa setelah 23:59 WIB pada tanggalnya", () => {
    const lastMoment = new Date("2026-11-04T23:59:00+07:00");
    const after = new Date("2026-11-05T00:01:00+07:00");
    expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code, now: lastMoment }).ok).toBe(true);
    expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code, now: after })).toEqual({ ok: false, reason: "expired" });
  });

  it("tanpa rahasia server atau rahasia pendek -> fitur tidak tersedia (tertutup)", () => {
    expect(verifyStaffCode({ secret: undefined, email: EMAIL, code, now: NOW })).toEqual({ ok: false, reason: "unavailable" });
    expect(verifyStaffCode({ secret: "pendek", email: EMAIL, code, now: NOW })).toEqual({ ok: false, reason: "unavailable" });
    expect(() => makeStaffCode({ secret: "pendek", email: EMAIL, grant: ADMIN, expiresOn })).toThrow();
  });

  it("sampah dan kode kosong ditolak tanpa melempar", () => {
    for (const bad of ["", "VK", "bukan kode", "VK-20261104-AAAAA", "x".repeat(500)]) {
      expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code: bad, now: NOW }).ok).toBe(false);
    }
  });

  it("format tanggal Indonesia", () => {
    expect(formatExpiryId("20261104")).toBe("4 November 2026");
    expect(formatExpiryId("20270101")).toBe("1 Januari 2027");
    expect(formatExpiryId("bukan")).toBe("bukan");
  });
});
