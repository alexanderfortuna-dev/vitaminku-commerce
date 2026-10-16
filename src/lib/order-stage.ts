// Logika murni papan "Pesanan Masuk" (tanpa akses jaringan/DB; aman dipakai di browser dan di tes).
// Cermin dari kolom orders.stage dan RPC staff_set_order_stage di drizzle/migrations/0012_orders_stage.sql.
// Ubah keduanya bersamaan. Penegakan sebenarnya tetap di database (RPC) dan server (requirePermission).
import { normalizeBranchWhatsapp } from "./store-core";

export const ORDER_STAGES = ["baru", "dikonfirmasi", "dikemas", "dikirim", "selesai", "batal"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

/** Tahap yang bisa dituju lewat RPC (semua kecuali 'baru'). */
export type TargetStage = Exclude<OrderStage, "baru">;

export const STAGE_LABEL: Record<OrderStage, string> = {
  baru: "Baru",
  dikonfirmasi: "Dikonfirmasi",
  dikemas: "Dikemas",
  dikirim: "Dikirim",
  selesai: "Selesai",
  batal: "Batal",
};

/** Teks tombol besar untuk maju ke tahap berikutnya. */
export const ADVANCE_LABEL: Partial<Record<OrderStage, string>> = {
  baru: "Konfirmasi Pesanan",
  dikonfirmasi: "Tandai Dikemas",
  dikemas: "Tandai Dikirim",
  dikirim: "Tandai Selesai",
};

export const NEW_ORDER_LATE_MINUTES = 10;

const FORWARD: Partial<Record<OrderStage, TargetStage>> = {
  baru: "dikonfirmasi",
  dikonfirmasi: "dikemas",
  dikemas: "dikirim",
  dikirim: "selesai",
};

export function isOrderStage(v: unknown): v is OrderStage {
  return typeof v === "string" && (ORDER_STAGES as readonly string[]).includes(v);
}

export function isTerminalStage(s: OrderStage): boolean {
  return s === "selesai" || s === "batal";
}

/** Tahap berikutnya yang sah (hanya maju satu langkah), atau null bila sudah selesai/batal. */
export function nextStage(s: OrderStage): TargetStage | null {
  return FORWARD[s] ?? null;
}

/**
 * Perpindahan yang diizinkan database: satu langkah maju, atau Batal dari tahap yang belum selesai/batal.
 * Tidak boleh loncat, mundur, atau mengubah pesanan yang sudah selesai/batal.
 */
export function canTransition(from: OrderStage, to: OrderStage): boolean {
  if (from === to || to === "baru" || isTerminalStage(from)) return false;
  if (to === "batal") return true;
  return FORWARD[from] === to;
}

/** Pemetaan status pembayaran lama (orders.status) ke tahap — sama dengan backfill di migrasi 0012. */
export function stageFromStatus(status: string): OrderStage {
  if (status === "paid") return "dikonfirmasi";
  if (status === "cancelled" || status === "expired") return "batal";
  return "baru";
}

/**
 * Tahap yang ditampilkan. Pesanan baru yang kedaluwarsa/dibatalkan sistem (mis. lewat webhook pembayaran)
 * masih bertahap 'baru' di database, tetapi tidak boleh tampil sebagai pesanan masuk yang perlu dikonfirmasi.
 */
export function effectiveStage(order: { status: string; stage: string }): OrderStage {
  const stage: OrderStage = isOrderStage(order.stage) ? order.stage : stageFromStatus(order.status);
  if (stage === "baru" && (order.status === "cancelled" || order.status === "expired")) return "batal";
  return stage;
}

export function ageMinutes(createdAt: string | number | Date, now: number | Date = Date.now()): number {
  const t = new Date(createdAt).getTime();
  const n = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(t) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor((n - t) / 60000));
}

/**
 * "Belum dikonfirmasi > 10 menit": hanya tahap baru yang masih menunggu keputusan staf.
 * Pesanan Midtrans yang belum dibayar (status 'pending') menunggu pelanggan, bukan staf, jadi tidak ditandai.
 */
export function isLateNewOrder(
  order: { status: string; stage: string; created_at: string },
  now: number | Date = Date.now(),
  thresholdMinutes: number = NEW_ORDER_LATE_MINUTES,
): boolean {
  if (effectiveStage(order) !== "baru") return false;
  if (order.status === "pending") return false;
  return ageMinutes(order.created_at, now) > thresholdMinutes;
}

/** "5 mnt", "2 jam 5 mnt", "3 hari". */
export function formatAge(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt`;
  if (m < 60 * 24) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} jam ${rest} mnt` : `${h} jam`;
  }
  return `${Math.floor(m / (60 * 24))} hari`;
}

/** Pesanan lama hasil backfill (belum pernah dipindah lewat papan) yang sudah berumur lebih dari 3 hari. */
export function isLegacyBackfilled(
  order: { stage_updated_at: string | null; created_at: string },
  now: number | Date = Date.now(),
): boolean {
  return !order.stage_updated_at && ageMinutes(order.created_at, now) > 3 * 24 * 60;
}

/* --------------------------- pesan WhatsApp per tahap --------------------------- */

export type WaStage = Exclude<OrderStage, "baru">;

export interface StageMessageInput {
  customerName: string;
  orderNumber: string;
  branchName?: string | null;
  /** Hanya dipakai untuk tahap 'dikirim'; boleh kosong. */
  courierLabel?: string | null;
  resi?: string | null;
}

/** Template Indonesia sopan per tahap. Dikirim manual oleh staf (tautan wa.me), tidak pernah otomatis. */
export function buildStageMessage(stage: WaStage, i: StageMessageInput): string {
  const name = i.customerName.trim();
  const hello = name ? `Halo Kak ${name}, ` : "Halo Kak, ";
  const no = i.orderNumber;
  const sign = `\n\nSalam,\nVitaminKu${i.branchName ? ` ${i.branchName}` : ""}`;
  switch (stage) {
    case "dikonfirmasi":
      return `${hello}terima kasih sudah berbelanja di VitaminKu. Pesanan ${no} sudah kami konfirmasi dan sedang kami siapkan. Kami kabari lagi ya, Kak, kalau pesanannya sudah dikemas.${sign}`;
    case "dikemas":
      return `${hello}pesanan ${no} sedang kami kemas dengan rapi. Setelah siap dikirim, kami kabari lagi ya, Kak.${sign}`;
    case "dikirim": {
      const resi = i.resi?.trim();
      const via = i.courierLabel?.trim() ? ` melalui ${i.courierLabel.trim()}` : "";
      return `${hello}kabar baik, pesanan ${no} sudah kami kirim${via}.${resi ? ` No. resi: ${resi}.` : ""} Mohon ditunggu ya, Kak, dan pastikan nomor yang bisa dihubungi kurir aktif.${sign}`;
    }
    case "selesai":
      return `${hello}pesanan ${no} sudah selesai. Terima kasih sudah berbelanja di VitaminKu. Kalau ada kendala dengan pesanannya, silakan balas pesan ini ya, Kak.${sign}`;
    case "batal":
      return `${hello}mohon maaf, pesanan ${no} kami batalkan. Kalau Kakak sudah melakukan pembayaran, tim kami akan menghubungi Kakak untuk langkah selanjutnya. Silakan balas pesan ini bila ada yang ingin ditanyakan.${sign}`;
  }
}

/** Tautan wa.me ke nomor pelanggan; null bila nomor tidak bisa dipakai. */
export function buildWhatsappLink(customerNumber: string, text: string): string | null {
  const n = normalizeBranchWhatsapp(customerNumber) ?? customerNumber.replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(n)) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/* ------------------------------- pesan galat ------------------------------- */

/** Ubah galat database/server menjadi kalimat Indonesia sederhana untuk staf. */
export function friendlyStageError(raw: unknown): string {
  const msg = (raw instanceof Error ? raw.message : String(raw ?? "")).trim();
  const low = msg.toLowerCase();
  if (low.includes("urutan tahap salah")) return "Urutan tahap salah. Muat ulang papan lalu coba lagi.";
  if (low.includes("konfirmasi pesanan dulu")) return "Konfirmasi pesanan dulu sebelum dikemas.";
  if (low.includes("kemas pesanan dulu")) return "Kemas pesanan dulu sebelum dikirim.";
  if (low.includes("kirim pesanan dulu")) return "Kirim pesanan dulu sebelum diselesaikan.";
  if (low.includes("pesanan sudah selesai")) return "Pesanan ini sudah selesai dan tidak bisa diubah lagi.";
  if (low.includes("pesanan sudah batal") || low.includes("pesanan sudah cancelled"))
    return "Pesanan ini sudah dibatalkan dan tidak bisa diubah lagi.";
  if (low.includes("pesanan sudah")) return "Status pesanan ini sudah berubah. Muat ulang papan lalu coba lagi.";
  if (low.includes("stok tidak cukup")) return `${msg}. Cek stok dulu sebelum mengonfirmasi.`;
  if (low.includes("tahap tidak dikenal")) return "Tahap tidak dikenal.";
  if (low.includes("pesanan tidak ditemukan")) return "Pesanan tidak ditemukan. Muat ulang papan.";
  if (low.includes("forbidden") || low.includes("403") || low.includes("42501") || low.includes("akses ditolak"))
    return "Anda tidak punya izin untuk pesanan ini (mungkin cabang lain).";
  if (low.includes("401") || low.includes("jwt") || low.includes("unauthorized"))
    return "Sesi habis. Silakan masuk lagi.";
  return msg ? `Gagal memproses: ${msg}` : "Gagal memproses. Coba lagi sebentar lagi.";
}
