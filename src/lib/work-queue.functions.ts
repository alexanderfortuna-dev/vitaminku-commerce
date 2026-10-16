// Antrian Kerja: produk aktif yang masih kurang foto / harga / berat.
// Dibaca sebagai pengguna yang login (RLS berlaku, tanpa kunci service). Izin: products_edit ke atas (seller boleh melihat).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, type Ctx } from "./admin.functions";
import {
  QUEUE_PAGE_SIZE,
  clampOffset,
  filterQueue,
  isValidFilter,
  nextOffset,
  queueOrClause,
  type QueueFilter,
  type QueueRow,
  type QueueRowInput,
} from "./work-queue";

// Tipe Supabase bisa tertinggal dari kolom baru; klien dibuat longgar di sini (pola yang sama dengan admin-products).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (ctx: Ctx): any => ctx.supabase;

const COLS = "id,sku,name,brand,price,stock,weight_grams,image_url,is_active,is_blocked,is_hero";
const COUNT_FILTERS: QueueFilter[] = ["ALL", "NO_PHOTO", "NO_PRICE", "NO_WEIGHT"];

export interface WorkQueuePage {
  rows: QueueRow[];
  counts: Record<QueueFilter, number>;
  total: number;
  nextOffset: number | null;
}

export const listWorkQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { filter?: QueueFilter; offset?: number } | undefined) => ({
    filter: isValidFilter(input?.filter) ? input.filter : ("ALL" as QueueFilter),
    offset: clampOffset(input?.offset),
  }))
  .handler(async ({ data, context }): Promise<WorkQueuePage> => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "products_edit");

    // Hanya produk aktif & tidak diblokir. Produk Draf/diblokir bukan "antrian perbaikan produk tayang".
    const base = (select: string, opts?: { count: "exact"; head: true }) =>
      db(ctx).from("products").select(select, opts).eq("is_active", true).eq("is_blocked", false);

    const countFor = async (filter: QueueFilter) => {
      const { count, error } = await base("id", { count: "exact", head: true }).or(queueOrClause(filter));
      if (error) throw new Error(`Gagal menghitung antrian: ${error.message}`);
      return (count as number | null) ?? 0;
    };

    const [list, ...counted] = await Promise.all([
      base(COLS)
        .or(queueOrClause(data.filter))
        .order("is_hero", { ascending: false, nullsFirst: false })
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(data.offset, data.offset + QUEUE_PAGE_SIZE - 1),
      ...COUNT_FILTERS.map(countFor),
    ]);
    if (list.error) throw new Error(`Gagal memuat antrian: ${list.error.message}`);

    const counts = Object.fromEntries(COUNT_FILTERS.map((f, i) => [f, counted[i] as number])) as Record<
      QueueFilter,
      number
    >;
    // filterQueue = pagar terakhir (aktif, tidak diblokir, memang bermasalah) + label bisa-dibeli yang jujur.
    const rows = filterQueue((list.data ?? []) as QueueRowInput[], data.filter);
    return {
      rows,
      counts,
      total: counts[data.filter],
      nextOffset: nextOffset(data.offset, QUEUE_PAGE_SIZE, counts[data.filter]),
    };
  });
