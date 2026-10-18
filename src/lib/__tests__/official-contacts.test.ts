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

import { priceInquiryUrl } from "../official-contacts";
import { buildFallbackWhatsappUrl, buildWhatsappOrderMessage } from "../whatsapp-order";
import { createOrderMessage } from "../checkout.functions";

describe("tanya harga & pesan WhatsApp", () => {
  it("tanya harga ke nomor utama dengan nama produk", () => {
    const u = priceInquiryUrl('Whey "X" 1kg');
    expect(u.startsWith(`https://wa.me/${OFFICIAL_WHATSAPP_MAIN}?text=`)).toBe(true);
    expect(decodeURIComponent(u)).toContain('Whey "X" 1kg');
  });
  it("pesan WhatsApp memuat kode pesanan, item, qty, harga, total, nama, alamat; tujuan dua cabang berbeda", () => {
    const base = {
      order_number: "VK-261018-ABC123", subtotal: 250000, shipping_cost: 0, shipping_mode: "manual", courier_label: "x", total: 250000,
      customer_name: "Budi", whatsapp: "6281234567890", address: "Jl. Uji 1", district: "Sanur", city: "Denpasar", province: "Bali", postal_code: "80228",
      items: [{ name: "Whey A", quantity: 2, unit_price: 100000 }, { name: "Vit B", quantity: 1, unit_price: 50000 }],
    };
    const m1 = buildWhatsappOrderMessage({ ...base, branch_name: "Sanur" });
    for (const part of ["VK-261018-ABC123", "Whey A × 2 × Rp 100.000", "Vit B × 1 × Rp 50.000", "Total: Rp 250.000", "Budi", "Jl. Uji 1", "Cabang: Sanur"]) expect(m1).toContain(part);
    const m2 = buildWhatsappOrderMessage({ ...base, branch_name: "Canggu" });
    expect(m2).toContain("Cabang: Canggu");
  });
  it("fallback saat pencatatan gagal tetap memuat item dan alamat", () => {
    const u = buildFallbackWhatsappUrl("6281111111111", { items: [{ name: "Whey A", quantity: 1, unit_price: 100000 }], subtotal: 100000, customer_name: "Budi", whatsapp: "0812", address: "Jl. Uji 1", branch_name: "Sanur" });
    expect(u.startsWith("https://wa.me/6281111111111?text=")).toBe(true);
    const t = decodeURIComponent(u);
    expect(t).toContain("belum tercatat otomatis");
    expect(t).toContain("Whey A × 1 × Rp 100.000");
  });
  it("kode galat database dipetakan ke kalimat pelanggan", () => {
    expect(createOrderMessage("stok_kurang: whey")).toMatch(/Stok/);
    expect(createOrderMessage("produk_tanpa_harga: x")).toMatch(/harga/);
    expect(createOrderMessage(undefined)).toBe("Pesanan gagal dibuat. Coba lagi.");
  });
});
