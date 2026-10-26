/**
 * Kurir yang benar-benar aktif, ditentukan dari kunci yang terpasang di server. Tidak ada opsi yang ditampilkan
 * bila tidak didukung data/kunci nyata. (Menggantikan scaffold lama yang keliru menyebut ongkir dari Shopify.)
 *
 * - manual_whatsapp : tanpa kunci Biteship; cabang mengonfirmasi ongkir lewat WhatsApp (selalu ada).
 * - biteship_regular: BITESHIP_API_KEY terpasang; ongkir paket dihitung dari berat/ukuran produk dan asal cabang.
 * - biteship_instant: tambahan INSTANT_DELIVERY_ENABLED=true; hanya muncul per pesanan bila cabang & jarak memenuhi syarat
 *                     (lihat instant-delivery.ts). Akses Gojek/Grab lewat Biteship harus diuji di sandbox dengan kunci owner.
 */
export type DeliveryProviderId = "manual_whatsapp" | "biteship_regular" | "biteship_instant";

export interface DeliveryEnv {
  BITESHIP_API_KEY?: string | undefined;
  INSTANT_DELIVERY_ENABLED?: string | undefined;
}

export interface DeliveryProviderInfo {
  id: DeliveryProviderId;
  label: string;
  /** Nama secret yang harus dipasang owner agar aktif. */
  requiredSecrets: string[];
}

export const DELIVERY_PROVIDERS: DeliveryProviderInfo[] = [
  { id: "manual_whatsapp", label: "Ongkir dikonfirmasi cabang via WhatsApp", requiredSecrets: [] },
  { id: "biteship_regular", label: "Kurir paket (JNE, J&T, SiCepat, dll.)", requiredSecrets: ["BITESHIP_API_KEY"] },
  { id: "biteship_instant", label: "Instan Bali (Gojek/Grab dari cabang)", requiredSecrets: ["BITESHIP_API_KEY", "INSTANT_DELIVERY_ENABLED"] },
];

export function enabledDeliveryProviders(env: DeliveryEnv): DeliveryProviderId[] {
  const out: DeliveryProviderId[] = ["manual_whatsapp"];
  if (env.BITESHIP_API_KEY?.trim()) {
    out.push("biteship_regular");
    if (String(env.INSTANT_DELIVERY_ENABLED ?? "").trim().toLowerCase() === "true") out.push("biteship_instant");
  }
  return out;
}
