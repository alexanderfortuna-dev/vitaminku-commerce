// Store settings + branches. Public reads use the publishable client (RLS: active branches only);
// staff writes run as the signed-in user (RLS: owner/admin only).
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, requireRole, type Ctx } from "./admin.functions";
import { normalizeBranchWhatsapp } from "./store-core";

export interface Branch {
  id: string;
  name: string;
  area: string;
  whatsapp: string;
  is_active: boolean;
  display_order: number;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
}
export interface StoreSettings {
  store_name: string;
  logo_url: string | null;
  hero_title: string;
  hero_subtitle: string;
  free_shipping_note: string;
  operating_hours: string;
}

function publicClient() {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const getPublicStore = createServerFn({ method: "GET" }).handler(async () => {
  const c = publicClient();
  const [b, s] = await Promise.all([
    c.from("store_branches").select("id,name,area,whatsapp,is_active,display_order,lat,lng,maps_url").eq("is_active", true).order("display_order").order("name"),
    c.from("store_settings").select("store_name,logo_url,hero_title,hero_subtitle,free_shipping_note,operating_hours").eq("id", 1).maybeSingle(),
  ]);
  return { branches: (b.data ?? []) as Branch[], settings: (s.data ?? null) as StoreSettings | null };
});

export const getAdminStore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;
    const [b, s] = await Promise.all([
      db.from("store_branches").select("id,name,area,whatsapp,is_active,display_order,lat,lng,maps_url").order("display_order").order("name"),
      db.from("store_settings").select("store_name,logo_url,hero_title,hero_subtitle,free_shipping_note,operating_hours").eq("id", 1).maybeSingle(),
    ]);
    if (b.error) throw new Error(b.error.message);
    return { branches: (b.data ?? []) as Branch[], settings: (s.data ?? null) as StoreSettings | null };
  });

const branchSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Nama cabang minimal 2 huruf").max(60),
  area: z.string().trim().max(80),
  whatsapp: z.string().trim().min(8).max(20),
  is_active: z.boolean(),
  display_order: z.number().int().min(0).max(999),
  maps_url: z.string().trim().max(1000).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export const saveBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => branchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;
    const whatsapp = normalizeBranchWhatsapp(data.whatsapp);
    if (!whatsapp) throw new Error("Nomor WhatsApp tidak valid. Contoh: 0813 3995 0000");
    let lat = data.lat ?? null;
    let lng = data.lng ?? null;
    const maps_url = data.maps_url || null;
    if (maps_url && (lat == null || lng == null)) {
      const { parseMapsUrl } = await import("./geo");
      const p = parseMapsUrl(maps_url);
      if (!p) throw new Error("Koordinat tidak terbaca dari link Google Maps. Isi lat/lng manual.");
      ({ lat, lng } = p);
    }
    if ((lat == null) !== (lng == null)) throw new Error("Isi lat dan lng keduanya, atau kosongkan keduanya.");
    const row = { lat, lng, maps_url, name: data.name, area: data.area, whatsapp, is_active: data.is_active, display_order: data.display_order, updated_at: new Date().toISOString() };
    const res = data.id
      ? await db.from("store_branches").update(row).eq("id", data.id).select("id").single()
      : await db.from("store_branches").insert(row).select("id").single();
    if (res.error) throw new Error(`Gagal menyimpan cabang: ${res.error.message}`);
    return { id: res.data.id };
  });

export const deleteBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "branches_manage");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;
    // Tidak ada hapus permanen: cabang diarsipkan (nonaktif) agar riwayat pesanan tetap utuh.
    const { error } = await db
      .from("store_branches")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(`Gagal mengarsipkan cabang: ${error.message}`);
    return { ok: true };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        store_name: z.string().trim().min(2).max(60),
        logo_url: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\//.test(v), "Logo harus link https://"),
        hero_title: z.string().trim().max(120),
        hero_subtitle: z.string().trim().max(240),
        free_shipping_note: z.string().trim().max(160),
        operating_hours: z.string().trim().max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;
    const { error } = await db
      .from("store_settings")
      .update({ ...data, logo_url: data.logo_url || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(`Gagal menyimpan pengaturan: ${error.message}`);
    return { ok: true };
  });
