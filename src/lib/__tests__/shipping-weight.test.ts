import { describe, expect, it } from "vitest";
import { FALLBACK_ITEM_WEIGHT_GRAMS, billableTotal, shippingCoverage, unitBillableWeight, volumetricGrams } from "../shipping-weight";

describe("berat tertagih", () => {
  it("kotak 30×20×10 cm = 1.000 g volume", () => {
    expect(volumetricGrams(30, 20, 10)).toBe(1000);
  });
  it("pesanan uji: 1× 300 g tanpa ukuran + 2× 400 g berkotak 30×20×10 = 2.300 g tepat", () => {
    const s = billableTotal([
      { weight_grams: 300, quantity: 1 },
      { weight_grams: 400, length_cm: 30, width_cm: 20, height_cm: 10, quantity: 2 },
    ]);
    expect(s.totalGrams).toBe(2300);
    expect(s.fallbackLines).toBe(0);
  });
  it("ambil yang lebih besar: berat asli menang bila lebih berat dari volume", () => {
    const u = unitBillableWeight({ weight_grams: 2500, length_cm: 10, width_cm: 10, height_cm: 10 });
    expect(u).toMatchObject({ grams: 2500, source: "weight" });
  });
  it("hanya ukuran → berat volume; hanya berat → berat asli", () => {
    expect(unitBillableWeight({ length_cm: 30, width_cm: 20, height_cm: 10 })).toMatchObject({ grams: 1000, source: "volumetric" });
    expect(unitBillableWeight({ weight_grams: 750 })).toMatchObject({ grams: 750, source: "weight", dims: null });
  });
  it("berat & ukuran kosong → cadangan 500 g dan ditandai fallback (tidak dikarang)", () => {
    expect(unitBillableWeight({})).toMatchObject({ grams: FALLBACK_ITEM_WEIGHT_GRAMS, source: "fallback" });
    expect(billableTotal([{ quantity: 3 }])).toEqual({ totalGrams: 1500, fallbackLines: 1 });
  });
  it("ukuran tidak lengkap atau nol/negatif diabaikan; string numerik dari DB dibaca", () => {
    expect(unitBillableWeight({ weight_grams: "300", length_cm: "30", width_cm: 0, height_cm: 10 })).toMatchObject({ grams: 300, source: "weight", dims: null });
    expect(unitBillableWeight({ weight_grams: -5 })).toMatchObject({ source: "fallback" });
    expect(unitBillableWeight({ weight_grams: "x" })).toMatchObject({ source: "fallback" });
  });
  it("pembulatan ke atas dan jumlah pecahan/negatif tidak merusak total", () => {
    expect(volumetricGrams(10, 10, 10)).toBe(167); // 166,67 → 167
    expect(billableTotal([{ weight_grams: 100, quantity: -2 }]).totalGrams).toBe(0);
  });
  it("laporan cakupan", () => {
    const c = shippingCoverage([{ weight_grams: 100 }, { weight_grams: 200, length_cm: 1, width_cm: 1, height_cm: 1 }, {}, { weight_grams: null }]);
    expect(c).toEqual({ total: 4, withWeight: 2, withDims: 1, pctWeight: 50, pctDims: 25 });
    expect(shippingCoverage([])).toMatchObject({ total: 0, pctWeight: 0 });
  });
});
