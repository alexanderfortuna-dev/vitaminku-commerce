// Cadangan data & ringkasan galat (khusus owner). Semua dibaca sebagai pengguna yang login, jadi RLS tetap berlaku;
// izin diperiksa di server (requirePermission) dan setiap unduhan dicatat di admin_audit_log.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requirePermission, resolveSubject, type Ctx } from "./admin.functions";
import { hasPermission } from "./permissions";
import {
  BACKUP_COLUMNS,
  BACKUP_ROW_CAP,
  isBackupKind,
  selectFor,
  shapeRow,
  type BackupCell,
  type BackupKind,
} from "./backup-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (ctx: Ctx): any => ctx.supabase;
const asCtx = (c: unknown) => c as Ctx;

const TABLE: Record<BackupKind, string> = {
  produk: "products",
  pelanggan: "customers",
  pesanan: "orders",
  item_pesanan: "order_items",
};

export interface BackupResult {
  kind: BackupKind;
  header: string[];
  rows: BackupCell[][];
  count: number;
  /** true bila baris dipotong di batas BACKUP_ROW_CAP. */
  truncated: boolean;
  /** true bila kolom biaya modal ikut (hanya untuk pemegang izin hpp_view). */
  includesCost: boolean;
}

export const exportBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { kind: string }) => {
    if (!i || !isBackupKind(i.kind)) throw new Error("Jenis cadangan tidak dikenal.");
    return { kind: i.kind };
  })
  .handler(async ({ data, context }): Promise<BackupResult> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "backup_export");
    if (data.kind === "pelanggan") await requirePermission(ctx, "customers_export");

    const records: Array<Record<string, unknown>> = [];
    let truncated = false;
    for (let offset = 0; offset < BACKUP_ROW_CAP; offset += 1000) {
      const { data: page, error } = await db(ctx)
        .from(TABLE[data.kind])
        .select(selectFor(data.kind))
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error("Data tidak bisa dibaca. Coba lagi sebentar lagi.");
      records.push(...((page ?? []) as Array<Record<string, unknown>>));
      if (!page || page.length < 1000) break;
      if (offset + 1000 >= BACKUP_ROW_CAP) truncated = true;
    }

    const header = BACKUP_COLUMNS[data.kind].map((c) => c.label);
    const rows = records.map((r) => shapeRow(data.kind, r));
    let includesCost = false;

    // Kolom biaya modal: hanya bila akun ini memegang izin hpp_view (owner), diambil lewat RPC yang memeriksa izin sendiri.
    if (data.kind === "produk") {
      const subject = await resolveSubject(ctx);
      if (hasPermission(subject, "hpp_view")) {
        const cost = new Map<string, unknown>();
        for (let i = 0; i < records.length; i += 500) {
          const ids = records.slice(i, i + 500).map((r) => String(r["id"]));
          const { data: costRows, error } = await db(ctx).rpc("admin_get_product_hpp", { _ids: ids });
          if (error) throw new Error("Harga modal tidak bisa dibaca; cadangan dibatalkan.");
          for (const c of (costRows ?? []) as Array<{ id: string; hpp: number | null }>) cost.set(c.id, c.hpp);
        }
        header.push("Harga_modal");
        rows.forEach((row, i) => row.push((cost.get(String(records[i]!["id"])) as number | null | undefined) ?? null));
        includesCost = true;
      }
    }

    await audit(ctx, "backup_export", null, { kind: data.kind, count: rows.length, truncated, includesCost });
    return { kind: data.kind, header, rows, count: rows.length, truncated, includesCost };
  });

export interface RecentError {
  id: string;
  at: string;
  source: "client" | "server";
  message: string;
  path: string | null;
  kind: string | null;
}

/** Ringkasan galat terbaru (client_error / server_error) untuk halaman Cadangan. */
export const listRecentErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ errors: RecentError[]; last24h: number }> => {
    const ctx = asCtx(context);
    await requirePermission(ctx, "audit_view");
    const actions = ["client_error", "server_error"];
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [list, count] = await Promise.all([
      db(ctx).from("admin_audit_log").select("id,action,payload,created_at").in("action", actions).order("created_at", { ascending: false }).limit(25),
      db(ctx).from("admin_audit_log").select("id", { count: "exact", head: true }).in("action", actions).gte("created_at", since),
    ]);
    if (list.error) throw new Error("Catatan galat tidak bisa dibaca.");
    const errors = ((list.data ?? []) as Array<{ id: string; action: string; payload: Record<string, unknown> | null; created_at: string }>).map((r) => ({
      id: r.id,
      at: r.created_at,
      source: (r.action === "server_error" ? "server" : "client") as "client" | "server",
      message: String(r.payload?.["message"] ?? "(tanpa pesan)").slice(0, 300),
      path: typeof r.payload?.["path"] === "string" ? (r.payload["path"] as string) : null,
      kind: typeof r.payload?.["kind"] === "string" ? (r.payload["kind"] as string) : null,
    }));
    return { errors, last24h: (count.count as number | null) ?? 0 };
  });
