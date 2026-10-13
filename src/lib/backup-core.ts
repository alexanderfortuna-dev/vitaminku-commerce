// Bagian murni dari Cadangan Data (owner): definisi kolom, perapian sel, nama file.
// Penegakan izin ada di backup.functions.ts; file ini tidak membaca database.

export type BackupKind = "produk" | "pelanggan" | "pesanan" | "item_pesanan";
export const BACKUP_KINDS: BackupKind[] = ["produk", "pelanggan", "pesanan", "item_pesanan"];
export const BACKUP_ROW_CAP = 50_000;

export type BackupCell = string | number | boolean | null;

export interface BackupColumn {
  /** Kolom di database. */
  key: string;
  /** Judul kolom di file. */
  label: string;
}

/** Kolom per jenis. Rahasia (token akses/pembayaran, tautan bayar) sengaja tidak ada. */
export const BACKUP_COLUMNS: Record<BackupKind, BackupColumn[]> = {
  produk: [
    { key: "sku", label: "SKU" }, { key: "name", label: "Nama" }, { key: "brand", label: "Brand" },
    { key: "category", label: "Kategori" }, { key: "subcategory", label: "Subkategori" },
    { key: "size", label: "Ukuran" }, { key: "pack_count", label: "Isi" }, { key: "servings", label: "Porsi" },
    { key: "dose", label: "Dosis" }, { key: "flavor", label: "Rasa" }, { key: "variant_group", label: "Grup_varian" },
    { key: "price", label: "Harga" }, { key: "compare_at_price", label: "Harga_coret" }, { key: "stock", label: "Stok" },
    { key: "weight_grams", label: "Berat_gram" }, { key: "bpom_number", label: "BPOM" },
    { key: "description", label: "Deskripsi" }, { key: "image_url", label: "Foto_utama" },
    { key: "photo_count", label: "Jumlah_foto" }, { key: "status", label: "Status" },
    { key: "blocked_reason", label: "Alasan_blokir" }, { key: "slug", label: "Slug" },
    { key: "created_at", label: "Dibuat" }, { key: "updated_at", label: "Diubah" },
  ],
  pelanggan: [
    { key: "name", label: "Nama" }, { key: "whatsapp_normalized", label: "WhatsApp" }, { key: "email", label: "Email" },
    { key: "default_address", label: "Alamat" }, { key: "marketing_opt_in", label: "Setuju_promo" },
    { key: "consent_at", label: "Waktu_setuju" }, { key: "order_count", label: "Jumlah_pesanan" },
    { key: "total_spent", label: "Total_belanja" }, { key: "first_order_at", label: "Pesanan_pertama" },
    { key: "last_order_at", label: "Pesanan_terakhir" }, { key: "created_at", label: "Dibuat" },
  ],
  pesanan: [
    { key: "id", label: "ID" }, { key: "order_number", label: "Nomor_pesanan" }, { key: "created_at", label: "Dibuat" },
    { key: "status", label: "Status" }, { key: "stage", label: "Tahap" }, { key: "customer_name", label: "Nama" },
    { key: "whatsapp", label: "WhatsApp" }, { key: "address", label: "Alamat" }, { key: "district", label: "Kecamatan" },
    { key: "city", label: "Kota" }, { key: "province", label: "Provinsi" }, { key: "postal_code", label: "Kode_pos" },
    { key: "subtotal", label: "Subtotal" }, { key: "shipping_cost", label: "Ongkir" },
    { key: "discount_total", label: "Diskon" }, { key: "total", label: "Total" },
    { key: "courier_company", label: "Kurir" }, { key: "courier_label", label: "Layanan_kurir" },
    { key: "payment_mode", label: "Mode_bayar" }, { key: "last_transaction_status", label: "Status_transaksi" },
    { key: "paid_at", label: "Dibayar" }, { key: "promo_code", label: "Kode_promo" },
    { key: "referral_code", label: "Kode_referral" }, { key: "branch_name", label: "Cabang" },
    { key: "customer_note", label: "Catatan" },
  ],
  item_pesanan: [
    { key: "order_id", label: "ID_pesanan" }, { key: "sku", label: "SKU" }, { key: "name", label: "Nama" },
    { key: "quantity", label: "Jumlah" }, { key: "unit_price", label: "Harga_satuan" }, { key: "line_total", label: "Subtotal" },
  ],
};

export const BACKUP_LABEL: Record<BackupKind, string> = {
  produk: "Produk",
  pelanggan: "Pelanggan",
  pesanan: "Pesanan",
  item_pesanan: "Item pesanan",
};

/** Kolom database yang boleh dibaca per jenis (sama dengan BACKUP_COLUMNS kecuali kolom turunan). */
export const PRODUCT_SELECT =
  "id,sku,name,brand,category,subcategory,size,pack_count,servings,dose,flavor,variant_group,price,compare_at_price,stock,weight_grams,bpom_number,description,image_url,images,is_active,is_blocked,blocked_reason,slug,created_at,updated_at";

export function selectFor(kind: BackupKind): string {
  if (kind === "produk") return PRODUCT_SELECT;
  return [...new Set(["id", ...BACKUP_COLUMNS[kind].map((c) => c.key)])].join(",");
}

/**
 * Mencegah "formula injection" saat file dibuka di Excel/Sheets: teks yang diawali = + - @ (atau tab/CR)
 * diberi tanda petik di depan. Angka tidak diubah.
 */
export function safeCell(v: unknown): BackupCell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Baris mentah dari database → kolom turunan (Status, Jumlah_foto) + urutan sesuai BACKUP_COLUMNS. */
export function shapeRow(kind: BackupKind, rec: Record<string, unknown>): BackupCell[] {
  const r: Record<string, unknown> = { ...rec };
  if (kind === "produk") {
    r["photo_count"] = Array.isArray(rec["images"]) ? (rec["images"] as unknown[]).length : 0;
    r["status"] = rec["is_blocked"] ? "Diblokir" : rec["is_active"] ? "Live" : "Draf";
  }
  return BACKUP_COLUMNS[kind].map((c) => safeCell(r[c.key]));
}

export function backupFilename(kind: BackupKind, ext: "csv" | "xlsx", now = new Date()): string {
  return `cadangan-${kind.replace("_", "-")}-${now.toISOString().slice(0, 10)}.${ext}`;
}

export function isBackupKind(v: unknown): v is BackupKind {
  return typeof v === "string" && (BACKUP_KINDS as string[]).includes(v);
}
