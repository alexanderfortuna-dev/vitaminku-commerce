// Data tamu (nama, WhatsApp, alamat, cabang) diingat di perangkat pelanggan setelah pesanan pertama,
// agar pesanan berikutnya cukup satu ketukan. Tidak pernah dikirim ke server selain saat memesan.
import { clearRecentOrders } from "./recent-orders";
import { writePendingPromo } from "./promo";

export const SAVED_DETAILS_KEY = "vitaminku-checkout-details";

export interface SavedDetails {
  name?: string;
  whatsapp?: string;
  address?: string;
  branchId?: string | null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (s?: StorageLike | null): StorageLike | null => {
  try {
    return s ?? (typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    return null;
  }
};

export function loadSavedDetails(storage?: StorageLike | null): SavedDetails {
  try {
    const raw = store(storage)?.getItem(SAVED_DETAILS_KEY);
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!d || typeof d !== "object") return {};
    const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);
    const out: SavedDetails = {};
    const name = str("name"), whatsapp = str("whatsapp"), address = str("address"), branchId = str("branchId");
    if (name) out.name = name;
    if (whatsapp) out.whatsapp = whatsapp;
    if (address) out.address = address;
    if (branchId) out.branchId = branchId;
    return out;
  } catch {
    return {};
  }
}

export function saveDetails(d: { name: string; whatsapp: string; address: string; branchId: string | null }, storage?: StorageLike | null): void {
  try {
    store(storage)?.setItem(SAVED_DETAILS_KEY, JSON.stringify(d));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

export function clearSavedDetails(storage?: StorageLike | null): void {
  try {
    store(storage)?.removeItem(SAVED_DETAILS_KEY);
  } catch {
    /* abaikan */
  }
}

/** "Hapus data saya": data tamu, token pesanan di perangkat ini, dan kode promo tertunda — semuanya. */
export function forgetDevice(storage?: StorageLike | null): void {
  clearSavedDetails(storage);
  clearRecentOrders(storage ?? undefined);
  writePendingPromo(null, storage);
}

export function hasSavedDetails(storage?: StorageLike | null): boolean {
  const d = loadSavedDetails(storage);
  return !!(d.name || d.whatsapp || d.address);
}
