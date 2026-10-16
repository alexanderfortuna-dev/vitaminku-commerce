import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, Download, FileUp, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  applyBranchAdminImport,
  getBranchAdminsData,
  previewBranchAdminImport,
  saveBranchAdmin,
  setBranchAdminActive,
  type BranchAdminRow,
} from "@/lib/branch-admins.functions";
import { gridToImportRows, type ImportRawRow, type RowStatus } from "@/lib/branch-admin-import";
import { downloadBranchAdminTemplate } from "@/lib/branch-admin-sheet";
import { readGrid } from "@/lib/sheet-io";
import { hasPermission } from "@/lib/permissions";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/cabang-admin")({
  head: () => ({
    meta: [
      { title: "Admin Cabang — Panel Admin | VitaminKu" },
      { name: "description", content: "Atur admin Utama dan Cadangan tiap cabang, termasuk impor massal." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CabangAdminPage,
});

const field = "mt-1 w-full min-h-11 rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary";

/** 6281339950000 -> +62 813-3995-0000 (hanya tampilan). */
function formatWa(wa: string) {
  const rest = wa.replace(/^62/, "");
  return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`;
}

type Form = { id?: string; branch_id: string; name: string; whatsapp: string; role: "utama" | "cadangan"; is_active: boolean; referral_code: string };

function CabangAdminPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const allowed = hasPermission({ role }, "branches_manage");
  const [tab, setTab] = useState<"admin" | "impor">("admin");

  if (!allowed) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk Owner dan Manajer.</p>;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link to="/admin" aria-label="Kembali" className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-navy">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-extrabold text-navy">Admin Cabang</h1>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([["admin", "Daftar Admin"], ["impor", "Impor Massal"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`min-h-11 rounded-full text-sm font-bold ${tab === k ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "admin" ? <AdminList /> : <ImportPanel />}
    </div>
  );
}

function AdminList() {
  const qc = useQueryClient();
  const fetchData = useServerFn(getBranchAdminsData);
  const runSave = useServerFn(saveBranchAdmin);
  const runActive = useServerFn(setBranchAdminActive);
  const q = useQuery({ queryKey: ["branch-admins"], queryFn: () => fetchData(), retry: false });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.isPending) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  if (q.isError) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const { branches, admins } = q.data;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["branch-admins"] });
    void qc.invalidateQueries({ queryKey: ["links-data"] });
  };
  const blank = (branch_id: string): Form => ({ branch_id, name: "", whatsapp: "", role: "cadangan", is_active: true, referral_code: "" });

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await runSave({ data: { ...form, referral_code: form.referral_code || undefined } });
      toast.success("Admin disimpan");
      setForm(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(a: BranchAdminRow) {
    if (a.is_active && !window.confirm(`Nonaktifkan ${a.name}? Datanya tetap tersimpan dan bisa diaktifkan lagi.`)) return;
    try {
      await runActive({ data: { id: a.id, is_active: !a.is_active } });
      toast.success(a.is_active ? "Admin dinonaktifkan" : "Admin diaktifkan");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    }
  }

  return (
    <div className="space-y-3">
      {branches.length === 0 && <p className="text-sm text-muted-foreground">Belum ada cabang. Tambah di Pengaturan Toko atau lewat Impor Massal.</p>}
      {branches.map((b) => {
        const list = admins.filter((a) => a.branch_id === b.id);
        const hasUtama = list.some((a) => a.is_active && a.role === "utama");
        const anyActive = list.some((a) => a.is_active);
        return (
          <section key={b.id} className="space-y-2 rounded-2xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-navy">{b.name}{!b.is_active && <span className="ml-2 text-xs font-semibold text-muted-foreground">(cabang nonaktif)</span>}</p>
                <p className="text-xs text-muted-foreground">{b.code ? <>Kode: <b>{b.code}</b></> : <Link to="/admin/pengaturan" className="font-semibold text-primary underline">Isi kode cabang dulu</Link>}</p>
              </div>
              <button type="button" onClick={() => setForm(blank(b.id))} className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-secondary px-3 text-xs font-bold text-navy">
                <Plus className="h-4 w-4" /> Admin
              </button>
            </div>
            {anyActive && !hasUtama && <p className="rounded-lg bg-destructive/10 p-2 text-xs font-semibold text-destructive">Belum ada admin Utama aktif. Jadikan salah satu admin sebagai Utama.</p>}
            {!anyActive && <p className="text-xs text-muted-foreground">Belum ada admin aktif.</p>}
            {list.map((a) => (
              <div key={a.id} className={`flex items-center gap-2 rounded-xl border border-border p-2 ${a.is_active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{formatWa(a.whatsapp)}{a.referral_code ? ` · ${a.referral_code}` : ""}</p>
                  <p className="mt-0.5 flex gap-1 text-[11px] font-bold">
                    <span className={`rounded-full px-2 py-0.5 ${a.role === "utama" ? "bg-primary/15 text-primary" : "bg-secondary text-navy"}`}>{a.role === "utama" ? "Utama" : "Cadangan"}</span>
                    <span className={`rounded-full px-2 py-0.5 ${a.is_active ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground"}`}>{a.is_active ? "Aktif" : "Nonaktif"}</span>
                  </p>
                </div>
                <button type="button" onClick={() => setForm({ id: a.id, branch_id: a.branch_id, name: a.name, whatsapp: a.whatsapp, role: a.role, is_active: a.is_active, referral_code: a.referral_code ?? "" })}
                  className="min-h-11 rounded-full bg-secondary px-3 text-xs font-bold text-navy">Ubah</button>
                <button type="button" onClick={() => void toggle(a)} className="min-h-11 rounded-full border border-border px-3 text-xs font-bold text-navy">
                  {a.is_active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            ))}
            {form && form.branch_id === b.id && (
              <div className="space-y-2 rounded-xl border border-primary/40 bg-secondary/40 p-3">
                <p className="text-xs font-bold text-navy">{form.id ? "Ubah admin" : "Tambah admin"}</p>
                <label className="block text-xs font-semibold text-navy">Nama
                  <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="block text-xs font-semibold text-navy">Nomor WhatsApp
                  <input className={field} inputMode="tel" placeholder="0813 3995 0000" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
                </label>
                <label className="block text-xs font-semibold text-navy">Peran
                  <select className={field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Form["role"] })}>
                    <option value="utama">Utama</option>
                    <option value="cadangan">Cadangan</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-navy">Kode referral (kosongkan = otomatis)
                  <input className={field} value={form.referral_code} onChange={(e) => setForm({ ...form, referral_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} maxLength={32} placeholder="mis. SANUR-MADE" />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-navy">
                  <input type="checkbox" className="h-5 w-5" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Aktif
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setForm(null)} className="min-h-11 rounded-full bg-secondary text-sm font-bold text-navy">Batal</button>
                  <button type="button" disabled={busy} onClick={() => void save()} className="min-h-11 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan"}</button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const STATUS_LABEL: Record<RowStatus, string> = { create: "Dibuat", update: "Diubah", skip: "Dilewati", error: "Galat" };
const STATUS_CLASS: Record<RowStatus, string> = {
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-sky-100 text-sky-800",
  skip: "bg-secondary text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};

type Preview = Awaited<ReturnType<typeof previewBranchAdminImport>>;
type Applied = Awaited<ReturnType<typeof applyBranchAdminImport>>;

function ImportPanel() {
  const qc = useQueryClient();
  const runPreview = useServerFn(previewBranchAdminImport);
  const runApply = useServerFn(applyBranchAdminImport);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "tpl" | "read" | "save">(null);
  const [file, setFile] = useState<{ name: string; rows: ImportRawRow[] } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  async function template() {
    setBusy("tpl");
    try {
      await downloadBranchAdminTemplate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat template");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy("read");
    setPreview(null);
    setApplied(null);
    try {
      const parsed = gridToImportRows(await readGrid(f));
      if ("error" in parsed) throw new Error(parsed.error);
      setFile({ name: f.name, rows: parsed.rows });
      setPreview(await runPreview({ data: { rows: parsed.rows, fileName: f.name } }));
    } catch (e) {
      setFile(null);
      toast.error(e instanceof Error ? e.message : "File tidak bisa dibaca");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function apply() {
    if (!file) return;
    setBusy("save");
    try {
      const res = await runApply({ data: { rows: file.rows, fileName: file.name } });
      setApplied(res);
      setPreview(null);
      setFile(null);
      void qc.invalidateQueries({ queryKey: ["branch-admins"] });
      void qc.invalidateQueries({ queryKey: ["links-data"] });
      void qc.invalidateQueries({ queryKey: ["admin-store"] });
      void qc.invalidateQueries({ queryKey: ["public-store"] });
      if (res.failed) toast.error(`${res.failed} baris gagal disimpan`);
      else toast.success("Impor selesai");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menerapkan");
    } finally {
      setBusy(null);
    }
  }

  const changes = preview ? preview.summary.rowsCreate + preview.summary.rowsUpdate : 0;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold text-navy">1. Unduh template</p>
        <p className="text-xs text-muted-foreground">Satu baris = satu admin. Hapus baris CONTOH sebelum diunggah. Petunjuk ada di sheet kedua.</p>
        <button type="button" onClick={() => void template()} disabled={busy !== null}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50">
          <Download className="h-4 w-4" /> {busy === "tpl" ? "Menyiapkan…" : "Unduh template"}
        </button>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold text-navy">2. Pilih file (.xlsx / .csv)</p>
        <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy !== null}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-secondary text-sm font-bold text-navy disabled:opacity-50">
          <FileUp className="h-4 w-4" /> {busy === "read" ? "Memeriksa file…" : "Pilih file"}
        </button>
        {file && <p className="truncate text-xs text-muted-foreground">File: {file.name}</p>}
      </section>

      {preview && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold text-navy">3. Pratinjau — belum ada yang tersimpan</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Akan dibuat" value={preview.summary.rowsCreate} />
            <Stat label="Akan diubah" value={preview.summary.rowsUpdate} />
            <Stat label="Dilewati" value={preview.summary.rowsSkip} />
            <Stat label="Galat" value={preview.summary.rowsError} tone={preview.summary.rowsError ? "bad" : undefined} />
          </dl>
          <p className="text-xs text-muted-foreground">
            Cabang baru: {preview.summary.branchesCreate} · cabang diubah: {preview.summary.branchesUpdate} · admin baru: {preview.summary.adminsCreate} · admin diubah: {preview.summary.adminsUpdate}
            {preview.summary.warnings ? ` · peringatan: ${preview.summary.warnings}` : ""}
          </p>
          {preview.summary.rowsError > 0 && <p className="text-xs font-semibold text-destructive">Baris yang galat dilewati. Baris lain tetap diterapkan.</p>}
          <RowList rows={preview.rows} />
          <button type="button" onClick={() => void apply()} disabled={busy !== null || changes === 0}
            className="min-h-11 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy === "save" ? "Menyimpan…" : changes === 0 ? "Tidak ada yang perlu diterapkan" : `Terapkan (${changes} baris)`}
          </button>
        </section>
      )}

      {applied && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold text-navy">Selesai</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Cabang tersimpan" value={applied.branchesDone} />
            <Stat label="Admin tersimpan" value={applied.adminsDone} />
            <Stat label="Dilewati" value={applied.rowsSkip} />
            <Stat label="Gagal / galat" value={applied.failed + applied.rowsError} tone={applied.failed + applied.rowsError ? "bad" : undefined} />
          </dl>
          {applied.failures.length > 0 && (
            <ul className="space-y-1 text-xs text-destructive">
              {applied.failures.map((f) => <li key={`${f.row}-${f.message}`}>{f.message}</li>)}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Mengunggah file yang sama lagi aman: tidak ada data ganda.</p>
        </section>
      )}
    </div>
  );
}

function RowList({ rows }: { rows: Preview["rows"] }) {
  const [all, setAll] = useState(false);
  const shown = (all ? rows : rows.filter((r) => r.status === "error" || r.warnings.length > 0)).slice(0, 200);
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setAll(!all)} className="min-h-11 w-full rounded-full border border-border text-xs font-bold text-navy">
        {all ? "Tampilkan hanya galat & peringatan" : `Lihat semua baris (${rows.length})`}
      </button>
      {shown.length === 0 && <p className="text-xs text-muted-foreground">Tidak ada galat atau peringatan.</p>}
      <ul className="max-h-72 space-y-2 overflow-y-auto text-xs">
        {shown.map((r) => (
          <li key={r.row} className="rounded-lg border border-border p-2">
            <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
            <span className="text-navy">{r.message}</span>
            {r.warnings.map((w) => <p key={w} className="mt-1 text-amber-700">Peringatan: {w}</p>)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" | undefined }) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-lg font-extrabold ${tone === "bad" ? "text-destructive" : "text-navy"}`}>{value.toLocaleString("id-ID")}</dd>
    </div>
  );
}
