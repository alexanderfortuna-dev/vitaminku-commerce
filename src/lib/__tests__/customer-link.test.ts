import { describe, expect, it } from "vitest";
import {
  FALLBACK_WHATSAPP,
  clientIpFrom,
  orderVisitorHash,
  otherAdmins,
  pickWhatsappDestination,
  normalizeWhatsapp,
  type BranchContact,
} from "../checkout-core";
import { cleanBranchCode, matchBranchByCode, parseLinkParams } from "../referral";

const B1 = "11111111-1111-1111-1111-111111111111";
const B2 = "22222222-2222-2222-2222-222222222222";
const contacts: BranchContact[] = [
  { branch_id: B1, role: "cadangan", whatsapp: "6281200000002" },
  { branch_id: B1, role: "utama", whatsapp: "6281200000001" },
  { branch_id: B2, role: "utama", whatsapp: "6281300000001" },
];

describe("parseLinkParams / cabang", () => {
  it("membaca ?cabang dan ?ref, menormalkan huruf besar", () => {
    expect(parseLinkParams("?cabang=sanur&ref=ab-12")).toEqual({ cabang: "SANUR", ref: "AB-12" });
  });
  it("menolak nilai tidak valid", () => {
    expect(parseLinkParams("?cabang=<x>&ref=a")).toEqual({ cabang: null, ref: null });
    expect(parseLinkParams("")).toEqual({ cabang: null, ref: null });
    expect(cleanBranchCode("x".repeat(30))).toBeNull();
  });
});

describe("matchBranchByCode", () => {
  const branches = [
    { id: "a", code: "SNR", is_active: true },
    { id: "b", code: null, is_active: true },
    { id: "c", code: "OFF", is_active: false },
  ];
  it("cocok tanpa membedakan huruf besar/kecil", () => {
    expect(matchBranchByCode(branches, "snr")?.id).toBe("a");
  });
  it("tidak memilih cabang nonaktif, tanpa kode, atau kode asing", () => {
    expect(matchBranchByCode(branches, "OFF")).toBeNull();
    expect(matchBranchByCode(branches, "ZZZ")).toBeNull();
    expect(matchBranchByCode(branches, null)).toBeNull();
  });
});

describe("pickWhatsappDestination", () => {
  it("admin utama aktif menjadi tujuan; cadangan jadi 'admin lain'", () => {
    const d = pickWhatsappDestination({ branchId: B1, branchWhatsapp: "6289999999999", contacts });
    expect(d.whatsapp).toBe("6281200000001");
    expect(d.source).toBe("branch_utama");
    expect(d.others).toEqual([{ role: "cadangan", whatsapp: "6281200000002" }]);
  });
  it("admin ?ref aktif di cabang pilihan menang", () => {
    const d = pickWhatsappDestination({
      branchId: B1, branchWhatsapp: "6289999999999", contacts,
      refAdmin: { branch_id: B1, whatsapp: "6281200000002" },
    });
    expect(d.whatsapp).toBe("6281200000002");
    expect(d.source).toBe("ref_admin");
    expect(d.others.map((o) => o.whatsapp)).toEqual(["6281200000001"]);
  });
  it("admin ?ref dari cabang lain atau tidak aktif diabaikan", () => {
    const other = pickWhatsappDestination({ branchId: B1, branchWhatsapp: "6289999999999", contacts, refAdmin: { branch_id: B2, whatsapp: "6281300000001" } });
    expect(other.source).toBe("branch_utama");
    const inactive = pickWhatsappDestination({ branchId: B1, branchWhatsapp: "6289999999999", contacts, refAdmin: { branch_id: B1, whatsapp: "6281200000099" } });
    expect(inactive.whatsapp).toBe("6281200000001");
  });
  it("cabang tanpa admin memakai nomor cabang (kompatibel mundur)", () => {
    const d = pickWhatsappDestination({ branchId: "33333333-3333-3333-3333-333333333333", branchWhatsapp: "6289999999999", contacts });
    expect(d).toEqual({ whatsapp: "6289999999999", source: "branch", others: [] });
  });
  it("hanya cadangan tanpa utama: tujuan nomor cabang, cadangan jadi pilihan lain", () => {
    const d = pickWhatsappDestination({ branchId: B1, branchWhatsapp: "6289999999999", contacts: [contacts[0]!] });
    expect(d.whatsapp).toBe("6289999999999");
    expect(d.others).toEqual([{ role: "cadangan", whatsapp: "6281200000002" }]);
  });
  it("tanpa cabang memakai nomor utama toko; nomor admin tidak valid dibuang", () => {
    expect(pickWhatsappDestination({ branchId: null, branchWhatsapp: null, contacts }).whatsapp).toBe(FALLBACK_WHATSAPP);
    const bad = pickWhatsappDestination({ branchId: B1, branchWhatsapp: "6289999999999", contacts: [{ branch_id: B1, role: "utama", whatsapp: "123" }] });
    expect(bad.whatsapp).toBe("6289999999999");
  });
  it("otherAdmins tidak mengulang nomor yang sedang dipakai", () => {
    expect(otherAdmins(contacts, B1, "6281200000001").map((o) => o.whatsapp)).toEqual(["6281200000002"]);
    expect(otherAdmins(contacts, null, null)).toEqual([]);
  });
});

describe("batas laju pesanan", () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
  it("mengambil IP dari header proxy, null bila tidak ada", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIpFrom(h({ "cf-connecting-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" }))).toBe("5.6.7.8");
    expect(clientIpFrom(h({}))).toBeNull();
  });
  it("hash 64 hex, stabil, dan beda untuk IP/UA berbeda", async () => {
    const a = await orderVisitorHash("1.2.3.4", "UA");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await orderVisitorHash("1.2.3.4", "UA")).toBe(a);
    expect(await orderVisitorHash("1.2.3.5", "UA")).not.toBe(a);
  });
});

describe("normalisasi WhatsApp pelanggan", () => {
  it("cocok dengan format customers.whatsapp_normalized (^628[0-9]{7,12}$)", () => {
    expect(normalizeWhatsapp("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsapp("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsapp("812345678")).toBe("62812345678");
    expect(normalizeWhatsapp("12345")).toBeNull();
  });
});
