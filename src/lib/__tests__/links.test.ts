import { describe, expect, it } from "vitest";
import { adminLink, branchLink, cleanBranchCode, combinedLink, makeReferralCode, qrFileName } from "../links";

describe("tautan", () => {
  it("tautan cabang memakai ?cabang=KODE dan merapikan origin", () => {
    expect(branchLink("https://vitaminku.id/", "sanur")).toBe("https://vitaminku.id/?cabang=SANUR");
    expect(branchLink("https://vitaminku.id", " ubud-2 ")).toBe("https://vitaminku.id/?cabang=UBUD-2");
  });
  it("tanpa kode sah -> null (UI menampilkan 'Isi kode cabang dulu')", () => {
    expect(branchLink("https://x.id", null)).toBeNull();
    expect(branchLink("https://x.id", "")).toBeNull();
    expect(branchLink("https://x.id", "a b")).toBeNull();
    expect(cleanBranchCode("x")).toBeNull();
  });
  it("tautan admin dan gabungan", () => {
    expect(adminLink("https://x.id", "sanur-made")).toBe("https://x.id/?ref=SANUR-MADE");
    expect(adminLink("https://x.id", null)).toBeNull();
    expect(combinedLink("https://x.id", "sanur", "sanur-made")).toBe("https://x.id/?cabang=SANUR&ref=SANUR-MADE");
    expect(combinedLink("https://x.id", null, "sanur-made")).toBeNull();
  });
  it("nama file QR aman", () => {
    expect(qrFileName("cabang", "SANUR")).toBe("qr-cabang-SANUR.png");
    expect(qrFileName("ref", "../x y")).toBe("qr-ref-x" + "y.png");
  });
});

describe("makeReferralCode", () => {
  it("KODECABANG-NAMA dari kata pertama, tanpa aksen/spasi", () => {
    expect(makeReferralCode("SANUR", "Made Putra", new Set())).toBe("SANUR-MADE");
    expect(makeReferralCode("ubud", "Ni Luh Ayu", new Set())).toBe("UBUD-NI");
    expect(makeReferralCode("SANUR", "Éka-Sari", new Set())).toBe("SANUR-EKA");
  });
  it("unik: menambah -2, -3 saat bentrok", () => {
    const taken = new Set(["SANUR-MADE", "SANUR-MADE-2"]);
    expect(makeReferralCode("SANUR", "Made", taken)).toBe("SANUR-MADE-3");
  });
  it("selalu sah dan maksimal 32 huruf", () => {
    const code = makeReferralCode("ABCDEFGHIJKLMNOPQRSTUVWX", "Bartholomeus Ngurah", new Set());
    expect(code).toMatch(/^[A-Z0-9_-]{2,32}$/);
    const taken = new Set([code]);
    const next = makeReferralCode("ABCDEFGHIJKLMNOPQRSTUVWX", "Bartholomeus Ngurah", taken);
    expect(next).not.toBe(code);
    expect(next.length).toBeLessThanOrEqual(32);
    expect(makeReferralCode("SANUR", "???", new Set())).toBe("SANUR-ADMIN");
  });
});
