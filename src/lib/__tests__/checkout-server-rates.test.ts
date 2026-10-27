import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shippingRates } from "../checkout.server";

// Jawaban Biteship di sini SINTETIS (belum ada kunci/rekaman nyata); yang diuji adalah perilaku kode: kapan permintaan instan
// dikirim, apa yang terjadi bila gagal, dan asal/berat yang dikirim. Kecocokan nama kolom dengan API nyata = BELUM TERVERIFIKASI.
const regular = { pricing: [{ company: "jne", courier_name: "JNE", courier_service_name: "Reguler", type: "reg", price: 18000, duration: "2 - 3 days" }] };
const instantAnswer = {
  pricing: [
    { company: "gojek", courier_name: "Gojek", courier_service_name: "Instant", type: "instant", price: 22000, duration: "1 - 3 hours" },
    { company: "grab", courier_name: "Grab", courier_service_name: "Same Day", type: "same_day", price: 15000, duration: "6 hours" },
    { company: "grab", courier_name: "Grab", courier_service_name: "Mobil", type: "car_express", price: 90000, duration: "2 hours" },
  ],
};
const SANUR = { lat: -8.6905, lng: 115.263 };
const near = { lat: -8.668, lng: 115.231 };
const lines = [{ name: "Whey", value: 300000, quantity: 1, ship: { weight_grams: 900, length_cm: 20, width_cm: 20, height_cm: 25 } }];
const input = {
  areaId: "DEST", postalCode: "80228", lines,
  branch: { ...SANUR, postal_code: "80361", instant_delivery: true },
  customer: near, locationConsent: true,
};

let calls: Array<{ url: string; body: Record<string, unknown> }>;
function fetchMock(instantStatus = 200) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, body });
    const isInstant = typeof body["origin_latitude"] === "number";
    if (isInstant && instantStatus !== 200) return new Response("boom", { status: instantStatus });
    return new Response(JSON.stringify(isInstant ? instantAnswer : regular), { status: 200 });
  });
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("BITESHIP_API_KEY", "test-key");
  vi.stubEnv("INSTANT_DELIVERY_ENABLED", "");
  vi.stubEnv("INSTANT_MAX_KM", "");
  vi.stubEnv("SHIPPING_ORIGIN_POSTAL_CODE", "80111");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("shippingRates: kurir instan hanya bila saklar server menyala", () => {
  it("saklar mati: tepat satu permintaan (reguler), asal = kode pos cabang, berat tertagih nyata, tanpa permintaan instan", async () => {
    vi.stubGlobal("fetch", fetchMock());
    const r = await shippingRates(input);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ origin_postal_code: 80361, destination_area_id: "DEST" });
    expect(calls[0]!.body["origin_latitude"]).toBeUndefined();
    const item = (calls[0]!.body["items"] as Array<Record<string, number>>)[0]!;
    expect(item["weight"]).toBe(Math.ceil((20 * 20 * 25 * 1000) / 6000)); // 1667 g > 900 g
    expect(r.instant).toEqual({ ok: false, reason: "dimatikan" });
    expect(r.rates.every((x) => x.kind === "regular")).toBe(true);
  });
  it("saklar nyala + semua syarat: permintaan kedua memakai koordinat dan Gojek/Grab; hanya layanan instan/same-day ikut; urut harga", async () => {
    vi.stubEnv("INSTANT_DELIVERY_ENABLED", "true");
    vi.stubGlobal("fetch", fetchMock());
    const r = await shippingRates(input);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).toMatchObject({ origin_latitude: SANUR.lat, destination_longitude: near.lng, couriers: "gojek,grab" });
    expect(r.rates.map((x) => [x.company, x.service, x.kind])).toEqual([
      ["grab", "same_day", "instant"], ["jne", "reg", "regular"], ["gojek", "instant", "instant"],
    ]);
    expect(r.instant.ok).toBe(true);
  });
  it("saklar nyala tetapi pelanggan tidak membagikan lokasi: tidak ada permintaan instan", async () => {
    vi.stubEnv("INSTANT_DELIVERY_ENABLED", "true");
    vi.stubGlobal("fetch", fetchMock());
    const r = await shippingRates({ ...input, locationConsent: false });
    expect(calls).toHaveLength(1);
    expect(r.instant).toEqual({ ok: false, reason: "tanpa_izin_lokasi" });
  });
  it("saklar nyala tetapi cabang belum siap atau terlalu jauh: tidak ada permintaan instan", async () => {
    vi.stubEnv("INSTANT_DELIVERY_ENABLED", "true");
    vi.stubGlobal("fetch", fetchMock());
    await shippingRates({ ...input, branch: { ...SANUR, instant_delivery: false } });
    await shippingRates({ ...input, customer: { lat: -8.4508, lng: 115.6206 } });
    expect(calls.filter((c) => typeof c.body["origin_latitude"] === "number")).toHaveLength(0);
  });
  it("tarif instan gagal (Biteship 500): ongkir reguler tetap tampil, tidak melempar", async () => {
    vi.stubEnv("INSTANT_DELIVERY_ENABLED", "true");
    vi.stubGlobal("fetch", fetchMock(500));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await shippingRates(input);
    expect(r.rates.map((x) => x.company)).toEqual(["jne"]);
    spy.mockRestore();
  });
  it("tanpa kunci Biteship: ongkir manual via WhatsApp, tidak ada permintaan jaringan sama sekali", async () => {
    vi.stubEnv("BITESHIP_API_KEY", "");
    vi.stubEnv("INSTANT_DELIVERY_ENABLED", "true");
    vi.stubGlobal("fetch", fetchMock());
    const r = await shippingRates(input);
    expect(calls).toHaveLength(0);
    expect(r.mode).toBe("manual");
    expect(r.instant).toEqual({ ok: false, reason: "mode_manual" });
  });
  it("tanpa data cabang: asal = kode pos toko dari env; produk tanpa data dihitung berat cadangan dan dilaporkan", async () => {
    vi.stubGlobal("fetch", fetchMock());
    const r = await shippingRates({ areaId: "DEST", postalCode: "80228", lines: [{ name: "Tanpa data", value: 1000, quantity: 2 }] });
    expect(calls[0]!.body).toMatchObject({ origin_postal_code: 80111 });
    expect((calls[0]!.body["items"] as Array<Record<string, number>>)[0]!["weight"]).toBe(500);
    expect(r.fallbackLines).toBe(1);
  });
});
