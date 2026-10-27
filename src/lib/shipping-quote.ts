// Bentuk permintaan ongkir ke Biteship (murni, tanpa I/O): asal dari cabang terpilih, berat tertagih nyata per produk.
// Nama kolom mengikuti kontrak Biteship yang dipakai kode ini; diuji dengan fixture rekaman (tanpa jaringan).
import { DEFAULT_ORIGIN_POSTAL_CODE } from "./checkout-core";
import { unitBillableWeight, type ProductShipData } from "./shipping-weight";

export interface BranchOrigin {
  postal_code?: string | null;
  area_id?: string | null;
}

export type OriginSource = "cabang_area" | "cabang_pos" | "toko";

/** Asal kiriman: area Biteship cabang > kode pos cabang > kode pos toko dari env/standar. Tidak ada tebakan. */
export function pickOrigin(
  branch: BranchOrigin | null | undefined,
  envPostal?: string | null,
): { fields: { origin_area_id: string } | { origin_postal_code: number }; source: OriginSource } {
  const area = branch?.area_id?.trim();
  if (area) return { fields: { origin_area_id: area }, source: "cabang_area" };
  const pos = branch?.postal_code?.trim();
  if (pos && /^\d{5}$/.test(pos)) return { fields: { origin_postal_code: Number(pos) }, source: "cabang_pos" };
  const env = (envPostal ?? "").trim();
  return { fields: { origin_postal_code: Number(/^\d{5}$/.test(env) ? env : DEFAULT_ORIGIN_POSTAL_CODE) }, source: "toko" };
}

export interface RateLineInput {
  name: string;
  value: number;
  quantity: number;
  ship?: ProductShipData | undefined;
}

export interface BiteshipItem {
  name: string;
  value: number;
  quantity: number;
  /** Gram per unit, berat tertagih (lebih besar dari berat asli atau berat volume). */
  weight: number;
  length?: number;
  width?: number;
  height?: number;
}

export function biteshipItems(lines: RateLineInput[]): { items: BiteshipItem[]; fallbackLines: number } {
  let fallbackLines = 0;
  const items = lines.map((l) => {
    const u = unitBillableWeight(l.ship ?? {});
    if (u.source === "fallback") fallbackLines++;
    const item: BiteshipItem = { name: l.name.slice(0, 100), value: l.value, quantity: l.quantity, weight: u.grams };
    if (u.dims) {
      item.length = Math.ceil(u.dims.length);
      item.width = Math.ceil(u.dims.width);
      item.height = Math.ceil(u.dims.height);
    }
    return item;
  });
  return { items, fallbackLines };
}

export const REGULAR_COURIERS = "jne,jnt,sicepat,anteraja,pos,tiki,ninja,lion,idexpress,sap";

export function regularRatesBody(input: {
  branch?: BranchOrigin | null | undefined;
  envPostal?: string | null | undefined;
  destination: { areaId: string; postalCode: string };
  lines: RateLineInput[];
}) {
  const { fields, source } = pickOrigin(input.branch, input.envPostal);
  const { items, fallbackLines } = biteshipItems(input.lines);
  return {
    body: {
      ...fields,
      destination_area_id: input.destination.areaId,
      destination_postal_code: Number(input.destination.postalCode) || undefined,
      couriers: REGULAR_COURIERS,
      items,
    },
    originSource: source,
    fallbackLines,
  };
}

export interface Rate {
  company: string;
  service: string;
  label: string;
  price: number;
  etd: string;
  /** "regular" = kurir paket; "instant" = Gojek/Grab dari cabang (hanya bila memenuhi semua syarat). */
  kind?: "regular" | "instant";
}

/** Jawaban Biteship → daftar tarif bersih, termurah dulu. Harga tak valid dibuang. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseRates(data: any, kind: "regular" | "instant" = "regular"): Rate[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rates: Rate[] = (data?.pricing ?? []).map((p: any) => ({
    company: String(p.company ?? p.courier_code),
    service: String(p.type ?? p.courier_service_code),
    label: `${p.courier_name ?? p.company} ${p.courier_service_name ?? p.type}`,
    price: Math.round(Number(p.price)),
    etd: String(p.duration ?? p.shipment_duration_range ?? ""),
    kind,
  }));
  return rates.filter((r) => Number.isFinite(r.price) && r.price > 0).sort((a, b) => a.price - b.price);
}
