// Promo reads/writes. Public reads use the publishable client (RLS: running promos only,
// public columns only); staff writes run as the signed-in user (RLS: owner/admin).
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole, type Ctx } from "./admin.functions";
import type { Promo } from "./promo";

const PUBLIC_COLS = "code,label,kind,value,brand,starts_at,ends_at";

export const getRunningPromos = createServerFn({ method: "GET" }).handler(async (): Promise<Promo[]> => {
  const c = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.from("promos").select(PUBLIC_COLS).order("ends_at");
  if (error) return [];
  return (data ?? []).map((p) => ({ ...p, value: Number(p.value) }));
});

export interface AdminPromo extends Promo {
  id: string;
  is_active: boolean;
}

export const listAdminPromos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (ctx.supabase as any).from("promos").select(`id,is_active,${PUBLIC_COLS}`).order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminPromo[];
  });

export const saveAdminPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka"),
        label: z.string().trim().min(3).max(80),
        value: z.number().gt(0, "Persen harus > 0").max(90, "Maksimal 90%"),
        brand: z.string().trim().max(80).nullable(),
        starts_at: z.string().datetime({ offset: true }),
        ends_at: z.string().datetime({ offset: true }),
        is_active: z.boolean(),
      })
      .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), "Tanggal selesai harus setelah tanggal mulai")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const row = { ...data, code: data.code.toUpperCase(), brand: data.brand || null, kind: "percent", updated_at: new Date().toISOString() };
    delete (row as { id?: string }).id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;
    const res = data.id ? await db.from("promos").update(row).eq("id", data.id) : await db.from("promos").insert(row);
    if (res.error) throw new Error(`Gagal menyimpan promo: ${res.error.message}`);
    return { ok: true };
  });
