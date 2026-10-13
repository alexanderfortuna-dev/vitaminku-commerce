// Admin cabang (Utama/Cadangan), impor massal, dan data tautan. Semua tulis berjalan sebagai
// pengguna yang login (RLS: has_permission 'branches_manage'); tidak ada hapus permanen — hanya nonaktif.
// Pratinjau dan penerapan memakai perencana murni yang sama (planBranchAdminImport) dan
// SELALU merencanakan ulang di server dari data terbaru; pratinjau browser tidak dipercaya.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, requirePermission, type Ctx } from "./admin.functions";
import {
  planBranchAdminImport,
  TEMPLATE_HEADERS,
  type AdminRoleId,
  type ExistingAdmin,
  type ExistingBranch,
  type ImportRawRow,
} from "./branch-admin-import";
import { makeReferralCode, REFERRAL_CODE_RE } from "./links";
import { normalizeBranchWhatsapp } from "./store-core";

export interface BranchLite {
  id: string;
  name: string;
  area: string;
  code: string | null;
  is_active: boolean;
}
export interface BranchAdminRow {
  id: string;
  branch_id: string;
  name: string;
  whatsapp: string;
  role: AdminRoleId;
  referral_code: string | null;
  is_active: boolean;
}

/** Terjemahkan galat database ke kalimat Indonesia sederhana. */
export function friendlyDbError(message: string): string {
  if (message.includes("branch_admins_one_active_utama"))
    return "Cabang ini sudah punya admin Utama aktif. Jadikan dia Cadangan atau nonaktifkan dulu.";
  if (message.includes("branch_admins_branch_wa_key")) return "Nomor WhatsApp ini sudah terdaftar di cabang ini.";
  if (message.includes("branch_admins_ref_key")) return "Kode referral sudah dipakai admin lain.";
  if (message.includes("store_branches_code_key")) return "Kode cabang sudah dipakai cabang lain.";
  if (message.includes("row-level security")) return "Akses ditolak. Fitur ini untuk Owner dan Manajer.";
  return message;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const dbOf = (ctx: Ctx): Db => ctx.supabase as unknown as Db;

async function loadBranchesAndAdmins(db: Db) {
  const [b, a] = await Promise.all([
    db.from("store_branches").select("id,name,area,code,address,opening_hours,maps_url,lat,lng,display_order,is_active").order("display_order").order("name"),
    db.from("branch_admins").select("id,branch_id,name,whatsapp,role,referral_code,is_active").order("created_at"),
  ]);
  if (b.error) throw new Error(`Gagal membaca cabang: ${b.error.message}`);
  if (a.error) throw new Error(`Gagal membaca admin cabang: ${a.error.message}`);
  return {
    branches: (b.data ?? []) as Array<BranchLite & ExistingBranch>,
    admins: (a.data ?? []) as BranchAdminRow[],
  };
}

export const getBranchAdminsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "branches_manage");
    const { branches, admins } = await loadBranchesAndAdmins(dbOf(ctx));
    return {
      branches: branches.map(({ id, name, area, code, is_active }) => ({ id, name, area, code, is_active })) as BranchLite[],
      admins,
    };
  });

/** Data untuk halaman Tautan & QR (izin links_manage). */
export const getLinksData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "links_manage");
    const { branches, admins } = await loadBranchesAndAdmins(dbOf(ctx));
    return {
      branches: branches.map(({ id, name, area, code, is_active }) => ({ id, name, area, code, is_active })) as BranchLite[],
      admins: admins.filter((a) => a.is_active),
    };
  });

const adminSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid(),
  name: z.string().trim().min(2, "Nama admin minimal 2 huruf").max(80, "Nama admin maksimal 80 huruf"),
  whatsapp: z.string().trim().min(6).max(24),
  role: z.enum(["utama", "cadangan"]),
  is_active: z.boolean(),
  referral_code: z.string().trim().max(32).optional(),
});

export const saveBranchAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "branches_manage");
    const db = dbOf(ctx);
    const whatsapp = normalizeBranchWhatsapp(data.whatsapp);
    if (!whatsapp) throw new Error("Nomor WhatsApp tidak valid. Contoh: 0813 3995 0000");

    const { data: branch, error: bErr } = await db.from("store_branches").select("id,code,name").eq("id", data.branch_id).maybeSingle();
    if (bErr || !branch) throw new Error("Cabang tidak ditemukan.");

    // Tepat satu Utama aktif per cabang (DB juga menolak lewat indeks unik).
    if (data.role === "utama" && data.is_active) {
      let q = db.from("branch_admins").select("id,name").eq("branch_id", data.branch_id).eq("role", "utama").eq("is_active", true);
      if (data.id) q = q.neq("id", data.id);
      const { data: other } = await q.limit(1);
      if (other?.length) {
        throw new Error(`Cabang ini sudah punya admin Utama aktif (${other[0].name}). Jadikan dia Cadangan atau nonaktifkan dulu.`);
      }
    }

    // Kode referral: pakai yang diisi, atau buat otomatis KODECABANG-NAMA yang unik.
    let referral = (data.referral_code ?? "").trim().toUpperCase();
    if (referral && !REFERRAL_CODE_RE.test(referral)) throw new Error("Kode referral hanya huruf/angka/-/_ (2-32 karakter).");
    if (!referral && data.id) {
      const { data: cur } = await db.from("branch_admins").select("referral_code").eq("id", data.id).maybeSingle();
      referral = cur?.referral_code ?? "";
    }
    const autoRef = async () => {
      const { data: all } = await db.from("branch_admins").select("referral_code").not("referral_code", "is", null);
      const taken = new Set<string>((all ?? []).map((r: { referral_code: string }) => r.referral_code.toUpperCase()));
      return makeReferralCode(branch.code ?? branch.name, data.name, taken);
    };
    if (!referral) referral = await autoRef();

    const row = { branch_id: data.branch_id, name: data.name, whatsapp, role: data.role, is_active: data.is_active, referral_code: referral, updated_at: new Date().toISOString() };
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = data.id
        ? await db.from("branch_admins").update(row).eq("id", data.id).select("id").maybeSingle()
        : await db.from("branch_admins").insert(row).select("id").maybeSingle();
      if (!res.error && res.data) return { id: res.data.id as string, referral_code: referral };
      if (res.error?.message.includes("branch_admins_ref_key") && !data.referral_code) {
        row.referral_code = referral = await autoRef();
        continue;
      }
      throw new Error(res.error ? friendlyDbError(res.error.message) : "Perubahan tidak tersimpan. Cek akses Anda.");
    }
    throw new Error("Kode referral bentrok terus. Isi kode referral manual.");
  });

export const setBranchAdminActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "branches_manage");
    // Tidak ada hapus permanen: admin hanya dinonaktifkan.
    const { data: row, error } = await dbOf(ctx)
      .from("branch_admins")
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(friendlyDbError(error.message));
    if (!row) throw new Error("Perubahan tidak tersimpan. Cek akses Anda.");
    return { ok: true };
  });

// ---------- Impor massal ----------

type ImportInput = { rows: ImportRawRow[]; fileName: string };
function validateImport(input: unknown): ImportInput {
  const i = input as { rows?: unknown; fileName?: unknown };
  if (!i || !Array.isArray(i.rows)) throw new Error("File tidak valid.");
  if (i.rows.length > 2000) throw new Error("File terlalu besar (maks 2.000 baris).");
  const cell = (v: unknown) => (typeof v === "number" || typeof v === "string" ? v : null);
  return {
    fileName: String(i.fileName ?? "").slice(0, 200),
    rows: i.rows.map((r) => {
      const o = { row: Number((r as { row?: unknown }).row) || 0 } as ImportRawRow;
      for (const h of TEMPLATE_HEADERS) o[h] = cell((r as Record<string, unknown>)[h]);
      return o;
    }),
  };
}

async function planFromDb(ctx: Ctx, rows: ImportRawRow[]) {
  const { branches, admins } = await loadBranchesAndAdmins(dbOf(ctx));
  return planBranchAdminImport(rows, branches as ExistingBranch[], admins as ExistingAdmin[]);
}

/** Dry-run: tidak menulis apa pun. */
export const previewBranchAdminImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateImport)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "branches_manage");
    const plan = await planFromDb(ctx, data.rows);
    return { rows: plan.rows, summary: plan.summary };
  });

export const applyBranchAdminImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateImport)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "branches_manage");
    const db = dbOf(ctx);
    const plan = await planFromDb(ctx, data.rows); // rencana ulang dari data terbaru
    const failures: Array<{ row: number; message: string }> = [];
    const now = new Date().toISOString();
    const idByCode = new Map<string, string>();
    const failedCodes = new Set<string>();
    let branchesDone = 0;
    let adminsDone = 0;

    for (const b of plan.branches) {
      const res =
        b.action === "create"
          ? await db.from("store_branches").insert({ ...b.values, is_active: true, area: "", updated_at: now }).select("id").maybeSingle()
          : await db.from("store_branches").update({ ...b.values, updated_at: now }).eq("id", b.id!).select("id").maybeSingle();
      if (res.error || !res.data) {
        failedCodes.add(b.code);
        const why = res.error ? friendlyDbError(res.error.message) : "Akses ditolak.";
        for (const r of b.rows) failures.push({ row: r, message: `Baris ${r}: Gagal menyimpan cabang ${b.code}. ${why}` });
        continue;
      }
      idByCode.set(b.code, res.data.id as string);
      branchesDone++;
    }

    const taken = new Set(plan.admins.map((a) => a.values.referral_code));
    for (const a of plan.admins) {
      const branchId = a.branchId ?? idByCode.get(a.branchCode);
      if (!branchId || failedCodes.has(a.branchCode)) {
        failures.push({ row: a.row, message: `Baris ${a.row}: Admin dilewati karena cabang ${a.branchCode} gagal disimpan.` });
        continue;
      }
      let values = { ...a.values };
      let ok = false;
      let why = "";
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const res =
          a.action === "create"
            ? await db.from("branch_admins").insert({ branch_id: branchId, ...values }).select("id").maybeSingle()
            : await db.from("branch_admins").update({ ...values, updated_at: now }).eq("id", a.id!).select("id").maybeSingle();
        if (!res.error && res.data) ok = true;
        else if (res.error?.message.includes("branch_admins_ref_key")) {
          const next = makeReferralCode(a.branchCode, values.name, taken);
          taken.add(next);
          values = { ...values, referral_code: next };
          why = friendlyDbError(res.error.message);
        } else {
          why = res.error ? friendlyDbError(res.error.message) : "Akses ditolak.";
          break;
        }
      }
      if (ok) adminsDone++;
      else failures.push({ row: a.row, message: `Baris ${a.row}: Gagal menyimpan admin. ${why}` });
    }

    const counts = { branchesDone, adminsDone, failed: failures.length, ...plan.summary };
    await audit(ctx, "branch_admin_import", null, { fileName: data.fileName, ...counts });
    return { ...counts, failures, rows: plan.rows };
  });
