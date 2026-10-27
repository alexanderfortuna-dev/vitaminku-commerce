// Kurir instan Bali (Gojek/Grab lewat Biteship): aturan tampil murni. Opsi HANYA muncul bila SEMUA syarat terpenuhi:
// saklar nyala, cabang siap (saklar cabang nyala + titik lat/lng), cabang & pelanggan di Bali, pelanggan membagikan lokasi
// (persetujuan "Gunakan lokasi saya"), dan jarak lurus ≤ batas. Sisanya tidak dirender — bukan disabled, tidak ada.
import { haversineKm, validLatLng } from "./geo";
import type { BiteshipItem } from "./shipping-quote";

export const DEFAULT_INSTANT_MAX_KM = 20;
/** Kotak pembatas Pulau Bali (kasar, sengaja ketat). Titik di luarnya = bukan Bali. */
export const BALI_BBOX = { minLat: -8.9, maxLat: -8.05, minLng: 114.4, maxLng: 115.75 } as const;

export interface LatLng {
  lat: number;
  lng: number;
}

export function inBali(p: LatLng): boolean {
  return validLatLng(p.lat, p.lng) && p.lat >= BALI_BBOX.minLat && p.lat <= BALI_BBOX.maxLat && p.lng >= BALI_BBOX.minLng && p.lng <= BALI_BBOX.maxLng;
}

export type InstantReason = "dimatikan" | "cabang_belum_siap" | "bukan_bali" | "tanpa_izin_lokasi" | "terlalu_jauh";
export type InstantDecision = { ok: true; km: number } | { ok: false; reason: InstantReason };

export interface InstantInput {
  /** INSTANT_DELIVERY_ENABLED=true di server. */
  enabled: boolean;
  branch: { lat: number | null; lng: number | null; instant_delivery: boolean } | null | undefined;
  customer: LatLng | null | undefined;
  /** Pelanggan menekan "Gunakan lokasi saya" (persetujuan eksplisit). */
  consent: boolean;
  maxKm: number;
}

export function parseMaxKm(raw: string | undefined | null): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 && n <= 40 ? n : DEFAULT_INSTANT_MAX_KM;
}

export function instantEligibility(i: InstantInput): InstantDecision {
  if (!i.enabled) return { ok: false, reason: "dimatikan" };
  const b = i.branch;
  if (!b || !b.instant_delivery || b.lat == null || b.lng == null || !validLatLng(b.lat, b.lng)) return { ok: false, reason: "cabang_belum_siap" };
  if (!i.consent || !i.customer || !validLatLng(i.customer.lat, i.customer.lng)) return { ok: false, reason: "tanpa_izin_lokasi" };
  const from = { lat: b.lat, lng: b.lng };
  if (!inBali(from) || !inBali(i.customer)) return { ok: false, reason: "bukan_bali" };
  const km = haversineKm(from, i.customer);
  if (km > i.maxKm) return { ok: false, reason: "terlalu_jauh" };
  return { ok: true, km: Math.round(km * 10) / 10 };
}

export const INSTANT_COURIERS = "gojek,grab";

/** Permintaan tarif instan: koordinat (bukan kode pos) dan berat/ukuran tertagih per barang. */
export function instantRatesBody(input: { from: LatLng; to: LatLng; items: BiteshipItem[] }) {
  return {
    origin_latitude: input.from.lat,
    origin_longitude: input.from.lng,
    destination_latitude: input.to.lat,
    destination_longitude: input.to.lng,
    couriers: INSTANT_COURIERS,
    items: input.items,
  };
}

/** Hanya layanan instan/same-day yang ditawarkan di jalur ini (bukan layanan lain yang kebetulan dikembalikan). */
export function isInstantService(service: string): boolean {
  return /instant|same[_\s-]?day/i.test(service);
}
