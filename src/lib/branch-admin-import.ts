// Impor massal cabang + admin cabang (template cabang-admin-template.xlsx).
// LOGIKA MURNI: dipakai server untuk pratinjau (dry-run) DAN penerapan, jadi keduanya selalu sama.
// Tidak pernah menebak: koordinat hanya dari parseMapsUrl, nomor WA hanya dinormalisasi.
import type { RawCell } from "./bulk-price-stock";
import { parseMapsUrl } from "./geo";
import { cleanBranchCode, makeReferralCode } from "./links";
import { normalizeBranchWhatsapp } from "./store-core";

export const TEMPLATE_HEADERS = [
  "Kode_Cabang",
  "Nama_Cabang",
  "Alamat_Lengkap",
  "Link_Google_Maps",
  "Jam_Buka",
  "Peran_Admin",
  "Nama_Admin",
  "Nomor_WA",
  "Aktif",
] as const;
export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];
export type ImportRawRow = { row: number } & Record<TemplateHeader, RawCell>;

export const SAMPLE_ROW: readonly string[] = [
  "CONTOH",
  "CONTOH - hapus baris ini",
  "Jl. Contoh No. 1, Denpasar",
  "https://www.google.com/maps/place/Contoh/@-8.65,115.21,17z",
  "Setiap hari 09.00-21.00",
  "Utama",
  "CONTOH Admin",
  "0813 3995 0000",
  "Ya",
];

export type AdminRoleId = "utama" | "cadangan";

export interface ExistingBranch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  opening_hours: string | null;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
  display_order: number;
}
export interface ExistingAdmin {
  id: string;
  branch_id: string;
  name: string;
  whatsapp: string;
  role: AdminRoleId;
  referral_code: string | null;
  is_active: boolean;
}

export type RowStatus = "create" | "update" | "skip" | "error";
export interface RowResult {
  row: number;
  status: RowStatus;
  message: string;
  warnings: string[];
}
export interface BranchValues {
  code: string;
  name: string;
  address: string | null;
  opening_hours: string | null;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
}
export interface BranchOp {
  code: string;
  action: "create" | "update";
  id: string | null;
  /** create: semua kolom; update: hanya kolom yang berubah. */
  values: Partial<BranchValues> & { whatsapp?: string; display_order?: number };
  rows: number[];
}
export interface AdminOp {
  row: number;
  branchCode: string;
  branchId: string | null;
  action: "create" | "update";
  id: string | null;
  values: { name: string; whatsapp: string; role: AdminRoleId; is_active: boolean; referral_code: string };
  /** true bila admin Utama aktif yang sudah ada dinonaktifkan/diturunkan: harus diterapkan lebih dulu. */
  freesUtama: boolean;
}
export interface ImportSummary {
  rowsCreate: number;
  rowsUpdate: number;
  rowsSkip: number;
  rowsError: number;
  warnings: number;
  branchesCreate: number;
  branchesUpdate: number;
  adminsCreate: number;
  adminsUpdate: number;
}
export interface ImportPlan {
  rows: RowResult[];
  branches: BranchOp[];
  admins: AdminOp[];
  summary: ImportSummary;
}

// ---------- Membaca grid (baris pertama = header) ----------

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (c: RawCell): string => (c === null || c === undefined ? "" : String(c).trim());

export function gridToImportRows(grid: RawCell[][]): { rows: ImportRawRow[] } | { error: string } {
  const headerIdx = grid.findIndex((r) => (r ?? []).some((c) => text(c) !== ""));
  if (headerIdx < 0) return { error: "File kosong. Unduh template lalu isi barisnya." };
  const header = grid[headerIdx] ?? [];
  const colOf = new Map<TemplateHeader, number>();
  for (const h of TEMPLATE_HEADERS) {
    const i = header.findIndex((c) => norm(c) === norm(h));
    if (i >= 0) colOf.set(h, i);
  }
  const missing = TEMPLATE_HEADERS.filter((h) => !colOf.has(h));
  if (missing.length) return { error: `Kolom tidak ditemukan: ${missing.join(", ")}. Pakai template terbaru.` };
  const rows: ImportRawRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const o = { row: i + 1 } as ImportRawRow;
    for (const h of TEMPLATE_HEADERS) o[h] = r[colOf.get(h)!] ?? null;
    rows.push(o);
  }
  return { rows };
}

// ---------- Parser per sel ----------

export function parseRole(raw: RawCell): AdminRoleId | null {
  const v = text(raw).toLowerCase();
  return v === "utama" ? "utama" : v === "cadangan" ? "cadangan" : null;
}

/** Ya/Tidak. Sel kosong dianggap Ya. null = tidak dikenali. */
export function parseActive(raw: RawCell): boolean | null {
  const v = text(raw).toLowerCase();
  if (v === "") return true;
  if (["ya", "y", "iya", "yes", "true", "1", "aktif"].includes(v)) return true;
  if (["tidak", "t", "no", "n", "false", "0", "nonaktif"].includes(v)) return false;
  return null;
}

/** Nomor WA ke format 62…; null bila tidak valid. */
export function parseWhatsapp(raw: RawCell): string | null {
  return normalizeBranchWhatsapp(text(raw));
}

/** Koordinat HANYA dari link yang dikenali; tidak pernah menebak. */
export function coordsFromMapsLink(url: string): { lat: number; lng: number } | null {
  try {
    return parseMapsUrl(url);
  } catch {
    return null;
  }
}

const EXAMPLE_RE = /^contoh\b/i;

interface Parsed {
  row: number;
  code: string;
  branchName: string | null;
  address: string | null;
  mapsUrl: string | null;
  hours: string | null;
  role: AdminRoleId;
  adminName: string;
  wa: string;
  active: boolean;
}

function parseRow(r: ImportRawRow): { ok: Parsed } | { errors: string[] } {
  const errors: string[] = [];
  const code = cleanBranchCode(text(r.Kode_Cabang));
  if (!code) errors.push("Kode_Cabang tidak valid. Pakai 2-24 huruf/angka (boleh - dan _), contoh: SANUR.");
  const branchName = text(r.Nama_Cabang) || null;
  if (branchName && (branchName.length < 2 || branchName.length > 60)) errors.push("Nama_Cabang harus 2-60 huruf.");
  const address = text(r.Alamat_Lengkap) || null;
  if (address && address.length > 300) errors.push("Alamat_Lengkap terlalu panjang (maks 300 huruf).");
  const hours = text(r.Jam_Buka) || null;
  if (hours && hours.length > 120) errors.push("Jam_Buka terlalu panjang (maks 120 huruf).");
  const mapsUrl = text(r.Link_Google_Maps) || null;
  if (mapsUrl && (!/^https?:\/\/\S+$/i.test(mapsUrl) || mapsUrl.length > 1000)) {
    errors.push("Link_Google_Maps harus berupa link yang diawali https://.");
  }
  const role = parseRole(r.Peran_Admin);
  if (!role) errors.push("Peran_Admin harus Utama atau Cadangan.");
  const adminName = text(r.Nama_Admin);
  if (adminName.length < 2 || adminName.length > 80) errors.push("Nama_Admin wajib diisi (2-80 huruf).");
  const wa = parseWhatsapp(r.Nomor_WA);
  if (!wa) errors.push("Nomor WhatsApp tidak valid. Contoh: 0813 3995 0000");
  const active = parseActive(r.Aktif);
  if (active === null) errors.push("Aktif harus Ya atau Tidak.");
  if (errors.length) return { errors };
  return { ok: { row: r.row, code: code!, branchName, address, mapsUrl, hours, role: role!, adminName, wa: wa!, active: active! } };
}

// ---------- Perencana ----------

interface AdminState {
  wa: string;
  role: AdminRoleId;
  active: boolean;
  name: string;
  existing: ExistingAdmin | null;
  /** indeks baris file yang menyentuh admin ini; null = murni data DB */
  fromRow: number | null;
}

function buildState(existingAdmins: ExistingAdmin[], rows: Parsed[]): Map<string, AdminState> {
  const m = new Map<string, AdminState>();
  for (const a of existingAdmins) {
    m.set(a.whatsapp, { wa: a.whatsapp, role: a.role, active: a.is_active, name: a.name, existing: a, fromRow: null });
  }
  for (const p of rows) {
    const ex = m.get(p.wa)?.existing ?? null;
    m.set(p.wa, { wa: p.wa, role: p.role, active: p.active, name: p.adminName, existing: ex, fromRow: p.row });
  }
  return m;
}

const activeUtamas = (st: Map<string, AdminState>) => [...st.values()].filter((s) => s.active && s.role === "utama");

export function planBranchAdminImport(
  rawRows: ImportRawRow[],
  branches: ExistingBranch[],
  admins: ExistingAdmin[],
): ImportPlan {
  const results = new Map<number, RowResult>();
  const setResult = (row: number, status: RowStatus, message: string, warnings: string[] = []) =>
    results.set(row, { row, status, message, warnings });
  const fail = (row: number, msg: string) => setResult(row, "error", `Baris ${row}: ${msg}`);

  // 1. Parse per baris
  const parsed: Parsed[] = [];
  for (const r of rawRows) {
    if (TEMPLATE_HEADERS.every((h) => text(r[h]) === "")) continue; // baris kosong
    if ([r.Kode_Cabang, r.Nama_Cabang, r.Nama_Admin].some((c) => EXAMPLE_RE.test(text(c)))) {
      setResult(r.row, "skip", `Baris ${r.row}: Baris contoh dilewati.`);
      continue;
    }
    const p = parseRow(r);
    if ("errors" in p) fail(r.row, p.errors.join(" "));
    else parsed.push(p.ok);
  }

  // 2. Duplikat di dalam file (kode cabang + nomor WA yang sama)
  const seenKey = new Map<string, number>();
  const uniq: Parsed[] = [];
  for (const p of parsed) {
    const key = `${p.code}|${p.wa}`;
    const first = seenKey.get(key);
    if (first !== undefined) {
      fail(p.row, `Admin ini (nomor WA yang sama di cabang ${p.code}) sudah ada di baris ${first}. Hapus salah satunya.`);
      continue;
    }
    seenKey.set(key, p.row);
    uniq.push(p);
  }

  // 3. Kelompokkan per cabang + cek data cabang konsisten antarbaris
  const groups = new Map<string, Parsed[]>();
  for (const p of uniq) groups.set(p.code, [...(groups.get(p.code) ?? []), p]);

  const byCode = new Map(branches.filter((b) => b.code).map((b) => [b.code!.toUpperCase(), b]));
  const byName = new Map<string, ExistingBranch>();
  for (const b of branches) if (!b.code) byName.set(b.name.trim().toLowerCase(), b);
  const nameToCode = new Map(branches.filter((b) => b.code).map((b) => [b.name.trim().toLowerCase(), b.code!.toUpperCase()]));
  const claimed = new Set<string>();

  const takenRefs = new Set(admins.map((a) => (a.referral_code ?? "").toUpperCase()).filter(Boolean));
  const maxOrder = branches.reduce((m, b) => Math.max(m, b.display_order), -1);
  let newBranches = 0;

  const outBranches: BranchOp[] = [];
  const outAdmins: AdminOp[] = [];

  for (const [code, list0] of groups) {
    let list = list0;
    const groupFail = (msg: string, only?: Parsed) => {
      for (const p of only ? [only] : list) fail(p.row, msg);
      list = only ? list.filter((p) => p !== only) : [];
    };

    // konsistensi data cabang
    const ref: Record<"branchName" | "address" | "mapsUrl" | "hours", { v: string; row: number } | null> = {
      branchName: null, address: null, mapsUrl: null, hours: null,
    };
    const labels = { branchName: "Nama_Cabang", address: "Alamat_Lengkap", mapsUrl: "Link_Google_Maps", hours: "Jam_Buka" } as const;
    for (const p of [...list]) {
      let bad: string | null = null;
      for (const k of ["branchName", "address", "mapsUrl", "hours"] as const) {
        const v = p[k];
        if (!v) continue;
        const r0 = ref[k];
        if (!r0) ref[k] = { v, row: p.row };
        else if (r0.v.toLowerCase() !== v.toLowerCase()) bad = `${labels[k]} berbeda dengan baris ${r0.row} untuk cabang ${code}. Samakan isinya.`;
      }
      if (bad) groupFail(bad, p);
    }
    if (!list.length) continue;

    // cari cabang yang sudah ada
    const wantName = ref.branchName?.v ?? null;
    let existing: ExistingBranch | null = byCode.get(code) ?? null;
    let adoptByName = false;
    if (!existing && wantName) {
      const cand = byName.get(wantName.toLowerCase());
      if (cand && !claimed.has(cand.id)) {
        existing = cand;
        adoptByName = true;
      } else if (cand) {
        groupFail(`Cabang "${wantName}" sudah dipakai kode lain di file ini.`);
      } else {
        const other = nameToCode.get(wantName.toLowerCase());
        if (other) groupFail(`Nama cabang "${wantName}" sudah dipakai kode ${other}. Pakai kode itu atau ganti namanya.`);
      }
    }
    if (!list.length) continue;
    if (existing) claimed.add(existing.id);
    if (!existing && !wantName) {
      groupFail(`Nama_Cabang wajib diisi untuk cabang baru (${code}).`);
      continue;
    }

    // aturan Utama: tepat satu Utama aktif per cabang
    const exAdmins = existing ? admins.filter((a) => a.branch_id === existing!.id) : [];
    for (;;) {
      const st = buildState(exAdmins, list);
      const utamas = activeUtamas(st);
      if (utamas.length <= 1) break;
      const fromFile = utamas.filter((s) => s.fromRow !== null).sort((a, b) => a.fromRow! - b.fromRow!);
      const untouched = utamas.filter((s) => s.fromRow === null);
      const blame = untouched.length ? fromFile[0] : fromFile[1];
      if (!blame) break;
      const p = list.find((x) => x.row === blame.fromRow)!;
      if (untouched.length) {
        const u = untouched[0]!;
        groupFail(
          `Cabang ${code} sudah punya admin Utama aktif (${u.name}, ${u.wa}). Hanya boleh satu: ubah dia jadi Cadangan atau Aktif=Tidak di file ini, atau jadikan baris ini Cadangan.`,
          p,
        );
      } else {
        const first = fromFile[0]!.fromRow;
        groupFail(`Cabang ${code} hanya boleh punya satu admin Utama aktif (sudah ada di baris ${first}). Jadikan baris ini Cadangan.`, p);
      }
    }
    if (!list.length) continue;
    const finalState = buildState(exAdmins, list);
    const finalUtama = activeUtamas(finalState)[0] ?? null;
    const anyActive = [...finalState.values()].some((s) => s.active);
    if ((!existing || anyActive) && !finalUtama) {
      groupFail(
        existing
          ? `Cabang ${code} belum punya admin Utama aktif. Jadikan satu admin sebagai Utama (Aktif=Ya).`
          : `Cabang baru ${code} butuh satu admin Utama aktif.`,
      );
      continue;
    }

    // ---- operasi cabang ----
    const warnings: string[] = [];
    const firstRow = list[0]!.row;
    const mapsUrl = ref.mapsUrl?.v ?? null;
    let coords: { lat: number | null; lng: number | null } | null = null;
    if (mapsUrl) {
      const c = coordsFromMapsLink(mapsUrl);
      if (c) coords = { lat: c.lat, lng: c.lng };
      else {
        warnings.push(`Koordinat tidak terbaca dari link Google Maps cabang ${code}. Cabang bisa dipilih pelanggan, tapi tidak dipilih otomatis.`);
        // Link berubah dan tidak terbaca: koordinat lama bukan milik link baru, jadi dikosongkan (tidak menebak).
        if (!existing || mapsUrl !== existing.maps_url) coords = { lat: null, lng: null };
      }
    }
    let branchChanged = false;
    let branchOp: BranchOp;
    if (!existing) {
      newBranches++;
      branchOp = {
        code, action: "create", id: null, rows: list.map((p) => p.row),
        values: {
          code, name: wantName!, address: ref.address?.v ?? null, opening_hours: ref.hours?.v ?? null,
          maps_url: mapsUrl, lat: coords?.lat ?? null, lng: coords?.lng ?? null,
          whatsapp: finalUtama!.wa, display_order: maxOrder + newBranches,
        },
      };
      branchChanged = true;
    } else {
      const patch: BranchOp["values"] = {};
      if (adoptByName || existing.code?.toUpperCase() !== code) patch.code = code;
      if (wantName && wantName !== existing.name) patch.name = wantName;
      if (ref.address && ref.address.v !== existing.address) patch.address = ref.address.v;
      if (ref.hours && ref.hours.v !== existing.opening_hours) patch.opening_hours = ref.hours.v;
      if (mapsUrl && mapsUrl !== existing.maps_url) patch.maps_url = mapsUrl;
      if (coords && (coords.lat !== existing.lat || coords.lng !== existing.lng)) {
        patch.lat = coords.lat;
        patch.lng = coords.lng;
      }
      branchOp = { code, action: "update", id: existing.id, values: patch, rows: list.map((p) => p.row) };
      branchChanged = Object.keys(patch).length > 0;
      if (adoptByName) warnings.push(`Cabang yang sudah ada "${existing.name}" akan diberi kode ${code}.`);
    }
    if (branchChanged) outBranches.push(branchOp);

    // ---- operasi admin ----
    const groupAdminOps: AdminOp[] = [];
    for (const p of list) {
      const ex = exAdmins.find((a) => a.whatsapp === p.wa) ?? null;
      let referral = ex?.referral_code ?? null;
      if (!referral) {
        referral = makeReferralCode(code, p.adminName, takenRefs);
        takenRefs.add(referral);
      }
      const rowWarn = p.row === firstRow ? warnings : [];
      if (ex && ex.name === p.adminName && ex.role === p.role && ex.is_active === p.active && ex.referral_code) {
        const baseMsg = branchChanged && p.row === firstRow ? "Data cabang diperbarui." : "Tidak ada perubahan.";
        setResult(p.row, branchChanged && p.row === firstRow ? "update" : "skip", `Baris ${p.row}: ${baseMsg}`, rowWarn);
        continue;
      }
      const op: AdminOp = {
        row: p.row, branchCode: code, branchId: existing?.id ?? null,
        action: ex ? "update" : "create", id: ex?.id ?? null,
        values: { name: p.adminName, whatsapp: p.wa, role: p.role, is_active: p.active, referral_code: referral },
        freesUtama: !!ex && ex.is_active && ex.role === "utama" && (!p.active || p.role !== "utama"),
      };
      groupAdminOps.push(op);
      setResult(
        p.row,
        op.action,
        `Baris ${p.row}: ${op.action === "create" ? "Admin baru" : "Admin diperbarui"} (${p.adminName}, ${p.role === "utama" ? "Utama" : "Cadangan"}, ${p.active ? "aktif" : "nonaktif"}).`,
        rowWarn,
      );
    }
    outAdmins.push(...groupAdminOps);
    if (!existing && branchChanged) {
      // cabang baru: baris pertama ikut diberi catatan
      const r0 = results.get(firstRow);
      if (r0) r0.message += ` Cabang baru ${code} dibuat.`;
    }
  }

  // urutan penerapan: yang membebaskan slot Utama dulu, lalu ubah, lalu buat baru
  const rank = (o: AdminOp) => (o.freesUtama ? 0 : o.action === "update" ? 1 : 2);
  outAdmins.sort((a, b) => rank(a) - rank(b) || a.row - b.row);

  const rows = [...results.values()].sort((a, b) => a.row - b.row);
  const summary: ImportSummary = {
    rowsCreate: rows.filter((r) => r.status === "create").length,
    rowsUpdate: rows.filter((r) => r.status === "update").length,
    rowsSkip: rows.filter((r) => r.status === "skip").length,
    rowsError: rows.filter((r) => r.status === "error").length,
    warnings: rows.reduce((n, r) => n + r.warnings.length, 0),
    branchesCreate: outBranches.filter((b) => b.action === "create").length,
    branchesUpdate: outBranches.filter((b) => b.action === "update").length,
    adminsCreate: outAdmins.filter((a) => a.action === "create").length,
    adminsUpdate: outAdmins.filter((a) => a.action === "update").length,
  };
  return { rows, branches: outBranches, admins: outAdmins, summary };
}
