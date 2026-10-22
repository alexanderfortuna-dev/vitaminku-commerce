import { describe, expect, it } from "vitest";
import { THEME_BOOT_SCRIPT, THEME_KEY, readThemeChoice, resolveTheme, writeThemeChoice } from "../theme";
import { clearSavedDetails, forgetDevice, hasSavedDetails, loadSavedDetails, saveDetails } from "../checkout-details";
import { dismissPromo, isPromoDismissed, pickBannerPromo, promoBannerText, readPendingPromo, writePendingPromo, type Promo } from "../promo";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

describe("tema", () => {
  it("urutan: pilihan tersimpan → setelan sistem → terang", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("aneh", false)).toBe("light");
  });
  it("pilihan disimpan & 'system' menghapus simpanan", () => {
    const s = memoryStorage();
    writeThemeChoice("dark", s);
    expect(readThemeChoice(s)).toBe("dark");
    writeThemeChoice("system", s);
    expect(readThemeChoice(s)).toBe("system");
    expect(s.map.has(THEME_KEY)).toBe(false);
  });
  it("skrip boot memakai kunci yang sama dan menyala sebelum CSS (tanpa kedipan)", () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_KEY);
    expect(THEME_BOOT_SCRIPT).toContain('classList.toggle("dark"');
    expect(THEME_BOOT_SCRIPT).toContain("prefers-color-scheme: dark");
    expect(THEME_BOOT_SCRIPT.length).toBeLessThan(400);
  });
  it("penyimpanan rusak tidak melempar", () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(readThemeChoice(broken)).toBe("system");
    expect(() => writeThemeChoice("dark", broken)).not.toThrow();
  });
});

describe("data tamu (pakai data terakhir / hapus data saya)", () => {
  it("simpan → muat mengisi semua kolom; hapus mengosongkan", () => {
    const s = memoryStorage();
    expect(hasSavedDetails(s)).toBe(false);
    saveDetails({ name: "Budi", whatsapp: "081234567890", address: "Jl. Mawar 1, Sanur", branchId: "b1" }, s);
    expect(loadSavedDetails(s)).toEqual({ name: "Budi", whatsapp: "081234567890", address: "Jl. Mawar 1, Sanur", branchId: "b1" });
    expect(hasSavedDetails(s)).toBe(true);
    clearSavedDetails(s);
    expect(loadSavedDetails(s)).toEqual({});
    expect(hasSavedDetails(s)).toBe(false);
  });
  it("Hapus data saya menghapus data tamu, token pesanan, dan kode promo sekaligus", () => {
    const s = memoryStorage();
    saveDetails({ name: "Budi", whatsapp: "0812", address: "Jl. Mawar 1, Sanur", branchId: null }, s);
    s.setItem("vitaminku-recent-orders", JSON.stringify([{ orderNumber: "VK-1", token: "a".repeat(48) }]));
    writePendingPromo("HEMAT10", s);
    forgetDevice(s);
    expect(s.map.size).toBe(0);
  });
  it("isi penyimpanan yang rusak/asing diabaikan", () => {
    const s = memoryStorage();
    s.setItem("vitaminku-checkout-details", "{bukan json");
    expect(loadSavedDetails(s)).toEqual({});
    s.setItem("vitaminku-checkout-details", JSON.stringify({ name: 5, whatsapp: "08", address: null, extra: "x" }));
    expect(loadSavedDetails(s)).toEqual({ whatsapp: "08" });
  });
});

describe("promo di perangkat", () => {
  const promo = (over: Partial<Promo> = {}): Promo => ({
    code: "HEMAT10",
    label: "Diskon 10%",
    kind: "percent",
    value: 10,
    brand: null,
    starts_at: "2026-10-01T00:00:00Z",
    ends_at: "2026-12-31T23:59:59Z",
    is_active: true,
    ...over,
  });
  it("kode tertunda dinormalisasi; kosong = hapus", () => {
    const s = memoryStorage();
    writePendingPromo(" hemat 10 ", s);
    expect(readPendingPromo(s)).toBe("HEMAT10");
    writePendingPromo(null, s);
    expect(readPendingPromo(s)).toBeNull();
  });
  it("spanduk ditutup 24 jam per kode, lalu muncul lagi", () => {
    const s = memoryStorage();
    const t0 = Date.parse("2026-10-22T10:00:00Z");
    dismissPromo("hemat10", s, t0);
    expect(isPromoDismissed("HEMAT10", s, t0 + 1000)).toBe(true);
    expect(isPromoDismissed("HEMAT10", s, t0 + 23 * 3600_000)).toBe(true);
    expect(isPromoDismissed("HEMAT10", s, t0 + 25 * 3600_000)).toBe(false);
    expect(isPromoDismissed("LAIN", s, t0)).toBe(false);
  });
  it("pickBannerPromo: berjalan & belum ditutup; teks spanduk memuat kode", () => {
    const s = memoryStorage();
    const now = new Date("2026-10-22T10:00:00Z");
    const a = promo();
    const b = promo({ code: "FITLIFE5", label: "Hemat Fitlife", brand: "Fitlife" });
    expect(pickBannerPromo([a, b], s, now)?.code).toBe("HEMAT10");
    dismissPromo("HEMAT10", s, now.getTime());
    expect(pickBannerPromo([a, b], s, now)?.code).toBe("FITLIFE5");
    expect(pickBannerPromo([promo({ is_active: false })], s, now)).toBeNull();
    expect(pickBannerPromo([promo({ ends_at: "2026-10-01T00:00:00Z" })], s, now)).toBeNull();
    expect(promoBannerText(b)).toContain("untuk Fitlife · kode FITLIFE5");
  });
});
