import { describe, expect, it } from "vitest";
import { recoveryLinkError, recoveryRedirectTarget, validateNewPassword } from "../password-reset";

describe("validateNewPassword", () => {
  it("menolak kurang dari 10 karakter", () => expect(validateNewPassword("123456789", "123456789")).toMatch(/minimal 10/));
  it("menolak lebih dari 200 karakter", () => expect(validateNewPassword("a".repeat(201), "a".repeat(201))).toMatch(/maksimal 200/));
  it("menolak pengulangan berbeda", () => expect(validateNewPassword("abcdefghij", "abcdefghik")).toMatch(/tidak sama/));
  it("menerima kata sandi sah", () => expect(validateNewPassword("abcdefghij", "abcdefghij")).toBeNull());
});

describe("recoveryRedirectTarget", () => {
  it("mengarahkan tautan pemulihan dari beranda ke halaman setel sandi", () =>
    expect(recoveryRedirectTarget("/", "#access_token=x&type=recovery")).toBe("/admin/setel-sandi#access_token=x&type=recovery"));
  it("tidak mengganggu tautan masuk pelanggan (magiclink)", () =>
    expect(recoveryRedirectTarget("/masuk", "#access_token=x&type=magiclink")).toBeNull());
  it("tidak berulang bila sudah di halaman setel sandi", () =>
    expect(recoveryRedirectTarget("/admin/setel-sandi", "#type=recovery")).toBeNull());
  it("abaikan hash kosong", () => expect(recoveryRedirectTarget("/", "")).toBeNull());
});

describe("recoveryLinkError", () => {
  it("tautan kedaluwarsa", () => expect(recoveryLinkError("#error=access_denied&error_code=otp_expired")).toMatch(/kedaluwarsa/));
  it("galat lain", () => expect(recoveryLinkError("#error=access_denied")).toMatch(/tidak sah/));
  it("tanpa galat", () => expect(recoveryLinkError("#access_token=x&type=recovery")).toBeNull());
});
