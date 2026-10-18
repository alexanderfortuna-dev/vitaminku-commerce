import { describe, expect, it } from "vitest";
import { OFFICIAL_WHATSAPPS, OFFICIAL_WHATSAPP_MAIN, OFFICIAL_WHATSAPP_SECOND } from "../official-contacts";
import { FALLBACK_WHATSAPP, normalizeWhatsapp, pickWhatsappDestination } from "../checkout-core";
import { DEFAULT_WHATSAPP } from "../store-core";

describe("nomor WhatsApp resmi", () => {
  it("dua nomor resmi sesuai yang diberikan pemilik, format wa.me valid", () => {
    expect(OFFICIAL_WHATSAPP_MAIN).toBe("6281339950000");
    expect(OFFICIAL_WHATSAPP_SECOND).toBe("6282147739996");
    for (const w of OFFICIAL_WHATSAPPS) expect(normalizeWhatsapp(w.display)).toBe(w.number);
  });
  it("nomor cadangan checkout dan toko = nomor utama (satu sumber)", () => {
    expect(FALLBACK_WHATSAPP).toBe(OFFICIAL_WHATSAPP_MAIN);
    expect(DEFAULT_WHATSAPP).toBe(OFFICIAL_WHATSAPP_MAIN);
  });
  it("tanpa cabang pilihan, pesanan ke nomor utama; dengan cabang, ke admin utama cabang itu", () => {
    expect(pickWhatsappDestination({ branchId: null, branchWhatsapp: null, contacts: [] }).whatsapp).toBe(OFFICIAL_WHATSAPP_MAIN);
    const dest = pickWhatsappDestination({
      branchId: "b2",
      branchWhatsapp: "6282222222222",
      contacts: [
        { branch_id: "b1", role: "utama", whatsapp: "6281111111111" },
        { branch_id: "b2", role: "utama", whatsapp: "6283333333333" },
      ],
    });
    expect(dest.whatsapp).toBe("6283333333333");
  });
});
