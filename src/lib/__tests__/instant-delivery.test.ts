import { describe, expect, it } from "vitest";
import { haversineKm } from "../geo";
import { BALI_BBOX, DEFAULT_INSTANT_MAX_KM, inBali, instantEligibility, instantRatesBody, isInstantService, parseMaxKm } from "../instant-delivery";

const SANUR = { lat: -8.6905, lng: 115.263 }; // titik cabang uji (bukan data cabang asli)
const near = { lat: -8.668, lng: 115.231 }; // Denpasar timur
const amlapura = { lat: -8.4508, lng: 115.6206 };
const branch = (over: Partial<{ lat: number | null; lng: number | null; instant_delivery: boolean }> = {}) => ({ ...SANUR, instant_delivery: true, ...over });
const ok = { enabled: true, branch: branch(), customer: near, consent: true, maxKm: DEFAULT_INSTANT_MAX_KM };

describe("kurir instan Bali: aturan tampil", () => {
  it("titik uji memang ±5 km dan >35 km", () => {
    expect(haversineKm(SANUR, near)).toBeGreaterThan(3);
    expect(haversineKm(SANUR, near)).toBeLessThan(7);
    expect(haversineKm(SANUR, amlapura)).toBeGreaterThan(35);
  });
  it("cabang Denpasar + pelanggan ±5 km + izin lokasi + saklar nyala → opsi muncul", () => {
    const d = instantEligibility(ok);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.km).toBeLessThan(7);
  });
  it("jarak 35 km lebih → opsi TIDAK ada", () => {
    expect(instantEligibility({ ...ok, customer: amlapura })).toEqual({ ok: false, reason: "terlalu_jauh" });
  });
  it("koordinat cabang kosong → TIDAK ada (tidak pernah ditebak)", () => {
    expect(instantEligibility({ ...ok, branch: branch({ lat: null, lng: null }) })).toEqual({ ok: false, reason: "cabang_belum_siap" });
    expect(instantEligibility({ ...ok, branch: null })).toEqual({ ok: false, reason: "cabang_belum_siap" });
  });
  it("tanpa persetujuan lokasi atau tanpa koordinat pelanggan → TIDAK ada", () => {
    expect(instantEligibility({ ...ok, consent: false })).toEqual({ ok: false, reason: "tanpa_izin_lokasi" });
    expect(instantEligibility({ ...ok, customer: null })).toEqual({ ok: false, reason: "tanpa_izin_lokasi" });
    expect(instantEligibility({ ...ok, customer: { lat: Number.NaN, lng: 115 } })).toEqual({ ok: false, reason: "tanpa_izin_lokasi" });
  });
  it("saklar server mati atau saklar cabang mati → TIDAK ada", () => {
    expect(instantEligibility({ ...ok, enabled: false })).toEqual({ ok: false, reason: "dimatikan" });
    expect(instantEligibility({ ...ok, branch: branch({ instant_delivery: false }) })).toEqual({ ok: false, reason: "cabang_belum_siap" });
  });
  it("pelanggan atau cabang di luar Bali (Surabaya, Lombok) → TIDAK ada walau jaraknya diatur besar", () => {
    expect(instantEligibility({ ...ok, customer: { lat: -7.25, lng: 112.75 }, maxKm: 40 })).toEqual({ ok: false, reason: "bukan_bali" });
    expect(instantEligibility({ ...ok, customer: { lat: -8.58, lng: 116.1 }, maxKm: 40 })).toEqual({ ok: false, reason: "bukan_bali" });
    expect(instantEligibility({ ...ok, branch: branch({ lat: -7.25, lng: 112.75 }) })).toEqual({ ok: false, reason: "bukan_bali" });
  });
  it("kotak Bali memuat Denpasar, Ubud, Kuta, Singaraja; tidak memuat Banyuwangi/Lombok", () => {
    for (const p of [SANUR, { lat: -8.5069, lng: 115.2625 }, { lat: -8.7184, lng: 115.1686 }, { lat: -8.112, lng: 115.088 }]) expect(inBali(p)).toBe(true);
    for (const p of [{ lat: -8.22, lng: 114.37 }, { lat: -8.58, lng: 116.1 }, { lat: 0, lng: 0 }]) expect(inBali(p)).toBe(false);
    expect(BALI_BBOX.minLat).toBeLessThan(BALI_BBOX.maxLat);
  });
  it("batas jarak dari env: angka tak masuk akal kembali ke 20 km", () => {
    expect(parseMaxKm("15")).toBe(15);
    for (const bad of ["", "abc", "0", "-3", "500", undefined, null]) expect(parseMaxKm(bad as string)).toBe(DEFAULT_INSTANT_MAX_KM);
    expect(instantEligibility({ ...ok, maxKm: 2 })).toEqual({ ok: false, reason: "terlalu_jauh" });
  });
  it("permintaan tarif memakai koordinat dan hanya Gojek/Grab; layanan lain disaring", () => {
    const body = instantRatesBody({ from: SANUR, to: near, items: [{ name: "x", value: 1, quantity: 1, weight: 300 }] });
    expect(body).toMatchObject({ origin_latitude: SANUR.lat, destination_longitude: near.lng, couriers: "gojek,grab" });
    expect(["instant", "same_day", "Same Day"].every(isInstantService)).toBe(true);
    expect(["reg", "express", "yes"].some(isInstantService)).toBe(false);
  });
});
