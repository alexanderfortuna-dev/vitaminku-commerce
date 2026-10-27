import { describe, expect, it } from "vitest";
import { DEFAULT_ORIGIN_POSTAL_CODE } from "../checkout-core";
import { biteshipItems, parseRates, pickOrigin, regularRatesBody } from "../shipping-quote";

// Bentuk jawaban Biteship di bawah ini SINTETIS (disusun dari kontrak yang dipakai kode), bukan rekaman nyata:
// belum ada kunci Biteship. Kecocokan dengan API nyata = BELUM TERVERIFIKASI sampai uji sandbox dengan kunci owner.
const fixture = {
  pricing: [
    { company: "jne", courier_name: "JNE", courier_service_name: "Reguler", type: "reg", price: 18000.4, duration: "2 - 3 days" },
    { company: "sicepat", courier_name: "SiCepat", courier_service_name: "Halu", type: "halu", price: 9000, shipment_duration_range: "3 - 5" },
    { company: "x", courier_name: "X", courier_service_name: "Rusak", type: "bad", price: "abc" },
    { company: "y", courier_name: "Y", courier_service_name: "Nol", type: "free", price: 0 },
  ],
};

describe("asal kiriman", () => {
  it("area cabang > kode pos cabang > kode pos toko > standar", () => {
    expect(pickOrigin({ area_id: "AREA1", postal_code: "80228" })).toEqual({ fields: { origin_area_id: "AREA1" }, source: "cabang_area" });
    expect(pickOrigin({ postal_code: "80361" })).toEqual({ fields: { origin_postal_code: 80361 }, source: "cabang_pos" });
    expect(pickOrigin({ postal_code: "8036" }, "80111")).toEqual({ fields: { origin_postal_code: 80111 }, source: "toko" });
    expect(pickOrigin(null, "")).toEqual({ fields: { origin_postal_code: Number(DEFAULT_ORIGIN_POSTAL_CODE) }, source: "toko" });
    expect(pickOrigin({ area_id: "  " , postal_code: null }, "bukan-angka").source).toBe("toko");
  });
});

describe("barang untuk kurir", () => {
  it("berat per unit = berat tertagih; ukuran ikut hanya bila lengkap; cadangan ditandai", () => {
    const { items, fallbackLines } = biteshipItems([
      { name: "A", value: 100000, quantity: 1, ship: { weight_grams: 300 } },
      { name: "B", value: 50000, quantity: 2, ship: { weight_grams: 400, length_cm: 30, width_cm: 20, height_cm: 10 } },
      { name: "C", value: 20000, quantity: 1 },
    ]);
    expect(items[0]).toEqual({ name: "A", value: 100000, quantity: 1, weight: 300 });
    expect(items[1]).toMatchObject({ weight: 1000, length: 30, width: 20, height: 10, quantity: 2 });
    expect(items[2]!.weight).toBe(500);
    expect(fallbackLines).toBe(1);
    expect(items.reduce((n, i) => n + i.weight * i.quantity, 0)).toBe(300 + 2000 + 500);
  });
  it("badan permintaan reguler: asal cabang, tujuan area, tanpa harga/ongkir dari browser", () => {
    const { body, originSource } = regularRatesBody({
      branch: { postal_code: "80361" },
      destination: { areaId: "DEST", postalCode: "80228" },
      lines: [{ name: "A", value: 1000, quantity: 1, ship: { weight_grams: 250 } }],
    });
    expect(originSource).toBe("cabang_pos");
    expect(body).toMatchObject({ origin_postal_code: 80361, destination_area_id: "DEST", destination_postal_code: 80228 });
    expect(JSON.stringify(body)).not.toMatch(/shipping_cost|rate|price/);
  });
});

describe("negatif: browser tidak bisa menentukan berat atau ongkir", () => {
  it("berat/ongkir kiriman klien pada baris diabaikan; berat hanya dari data produk di database", () => {
    const tampered = { name: "A", value: 1000, quantity: 1, ship: { weight_grams: 250 }, weight: 1, shipping_cost: 0, price: 1 } as never;
    const { body } = regularRatesBody({ destination: { areaId: "D", postalCode: "80228" }, lines: [tampered] });
    expect(body.items[0]).toEqual({ name: "A", value: 1000, quantity: 1, weight: 250 });
    expect(JSON.stringify(body)).not.toMatch(/shipping_cost/);
  });
});

describe("tarif dari Biteship", () => {
  it("dibulatkan, termurah dulu, harga rusak atau nol dibuang", () => {
    const r = parseRates(fixture);
    expect(r.map((x) => [x.company, x.price])).toEqual([["sicepat", 9000], ["jne", 18000]]);
    expect(r[1]).toMatchObject({ service: "reg", label: "JNE Reguler", etd: "2 - 3 days", kind: "regular" });
    expect(parseRates({}).length).toBe(0);
    expect(parseRates(fixture, "instant")[0]!.kind).toBe("instant");
  });
});
