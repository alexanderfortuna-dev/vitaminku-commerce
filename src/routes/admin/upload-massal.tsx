import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, FileUp, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  applyFullImportChunk,
  exportFullTemplate,
  getLastImport,
  importProductPhotos,
  previewFullImport,
  undoLastImport,
} from "@/lib/seller.functions";
import { formatIssue } from "@/lib/import-messages";
import { FULL_HEADERS, gridToFullRows, type FullRow, type ImportMode } from "@/lib/seller-import";
import { csvBlob, downloadBlob, downloadImportTemplateXlsx, downloadXlsx, readGrid } from "@/lib/sheet-io";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/upload-massal")({
  head: () => ({
    meta: [
      { title: "Unggah Produk Massal — Seller Center | VitaminKu" },
      { name: "description", content: "Unggah dan perbarui banyak produk VitaminKu sekaligus dari Excel/CSV." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UploadMassalPage,
});

type Preview = Awaited<ReturnType<typeof previewFullImport>>;
type Issue = { row: number; sku: string; reason: string };
const CHUNK = 50;
const PHOTO_PARALLEL = 3;

function UploadMassalPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const fetchExport = useServerFn(exportFullTemplate);
  const runPreview = useServerFn(previewFullImport);
  const runChunk = useServerFn(applyFullImportChunk);
  const runPhotos = useServerFn(importProductPhotos);
  const fetchLast = useServerFn(getLastImport);
  const runUndo = useServerFn(undoLastImport);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("fill");
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; rows: FullRow[] } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [nextChunk, setNextChunk] = useState(0);
  const [result, setResult] = useState<{ created: number; updated: number; issues: Issue[]; photoFails: Issue[] } | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const lastImport = useQuery({
    queryKey: ["last-import"],
    queryFn: () => fetchLast(),
    enabled: canEditCommerce(role),
    retry: false,
  });

  if (!canEditCommerce(role)) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk admin/owner.</p>;

  async function downloadTemplate(kind: "xlsx" | "csv") {
    setBusy(kind);
    try {
      const { products } = await fetchExport();
      const rows = products.map((p) => [
        p.sku, p.name, p.brand, p.category, p.description ?? "", p.price ?? "", p.stock, p.weight_grams ?? "",
        p.length_cm ?? "", p.width_cm ?? "", p.height_cm ?? "",
        p.bpom_number ?? "", "", "", "", "", "", "", "", "", "", p.status,
      ]);
      const date = new Date().toISOString().slice(0, 10);
      if (kind === "csv") downloadBlob(`template-produk-${date}.csv`, csvBlob(FULL_HEADERS, rows));
      else
        await downloadXlsx(`template-produk-${date}.xlsx`, "Produk", FULL_HEADERS, rows,
          [18, 44, 18, 24, 40, 12, 8, 11, 11, 11, 11, 16, ...Array(9).fill(28), 10]);
      toast.success(`${products.length} produk di template. Kolom Foto kosong = foto lama tetap.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunduh template");
    } finally {
      setBusy(null);
    }
  }

  async function downloadBlankTemplate() {
    setBusy("blank");
    try {
      await downloadImportTemplateXlsx("template-kosong-upload-massal.xlsx");
      toast.success("Template kosong diunduh. Baca sheet Petunjuk, lalu hapus baris CONTOH sebelum mengunggah.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunduh template");
    } finally {
      setBusy(null);
    }
  }

  async function undoLast() {
    const last = lastImport.data?.last;
    if (!last) return;
    const when = new Date(last.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    const ok = window.confirm(
      `Batalkan impor terakhir (${last.fileName ?? "tanpa nama"}, ${when})?\n\n` +
        `Produk yang diperbarui dikembalikan ke data sebelum impor. Produk baru dari impor ini diarsipkan (tidak dihapus).`,
    );
    if (!ok) return;
    setBusy("undo");
    try {
      const r = await runUndo({ data: { importId: last.id } });
      toast.success(`Impor dibatalkan: ${r.restored} produk dikembalikan, ${r.archived} produk baru diarsipkan.`);
      setPreview(null);
      setResult(null);
      setFile(null);
      setImportId(null);
      setNextChunk(0);
      await qc.invalidateQueries({ queryKey: ["last-import"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impor tidak bisa dibatalkan");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(f: File | undefined, m = mode) {
    if (!f) return;
    setBusy("read");
    setPreview(null);
    setResult(null);
    setNextChunk(0);
    setImportId(null);
    try {
      const rows = gridToFullRows(await readGrid(f));
      setFile({ name: f.name, rows });
      setPreview(await runPreview({ data: { rows, mode: m, fileName: f.name } }));
    } catch (e) {
      setFile(null);
      toast.error(e instanceof Error ? e.message : "File tidak bisa dibaca");
    } finally {
      setBusy(null);
    }
  }

  async function apply(startChunk: number) {
    if (!file) return;
    setBusy("save");
    const chunks = Math.ceil(file.rows.length / CHUNK);
    const acc = result && startChunk > 0 ? { ...result } : { created: 0, updated: 0, issues: [] as Issue[], photoFails: [] as Issue[] };
    let currentImport = startChunk > 0 ? importId : null;
    if (startChunk === 0) setImportId(null);
    try {
      for (let c = startChunk; c < chunks; c++) {
        setProgress({ done: c, total: chunks, label: `Menyimpan batch ${c + 1}/${chunks}` });
        const rows = file.rows.slice(c * CHUNK, (c + 1) * CHUNK);
        const r = await runChunk({ data: { rows, mode, fileName: file.name, chunk: c, last: c === chunks - 1, importId: currentImport } });
        if (r.importId) {
          currentImport = r.importId;
          setImportId(r.importId);
        }
        acc.created += r.created;
        acc.updated += r.updated;
        acc.issues.push(...r.failed, ...r.stayedDraft);
        // Photos: downloaded server-side and re-hosted, a few products at a time.
        for (let i = 0; i < r.photoJobs.length; i += PHOTO_PARALLEL) {
          setProgress({ done: c, total: chunks, label: `Batch ${c + 1}/${chunks}: foto ${i + 1}/${r.photoJobs.length}` });
          const jobs = r.photoJobs.slice(i, i + PHOTO_PARALLEL);
          const res = await Promise.all(
            jobs.map((j) =>
              runPhotos({ data: { id: j.id, urls: j.urls, replace: j.replace, publish: j.publish } }).catch((e: unknown) => ({
                stored: 0, failed: j.urls.map((url) => ({ url, reason: e instanceof Error ? e.message : "gagal" })), live: false, issue: null,
              })),
            ),
          );
          res.forEach((p, k) => {
            const j = jobs[k]!;
            for (const f of p.failed) acc.photoFails.push({ row: j.row, sku: j.sku, reason: `Foto gagal (${f.reason}): ${f.url}` });
            if (j.publish && !p.live) acc.issues.push({ row: j.row, sku: j.sku, reason: p.issue ?? "Tetap Draf" });
          });
        }
        setNextChunk(c + 1);
        setResult({ ...acc });
      }
      setProgress({ done: chunks, total: chunks, label: "Selesai" });
      toast.success(`Selesai: ${acc.created} baru, ${acc.updated} diperbarui. Salah unggah? Tekan "Batalkan impor terakhir".`);
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "Gagal"} — tekan "Lanjutkan" untuk meneruskan dari batch terakhir.`, { duration: 10000 });
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: ["last-import"] });
    }
  }

  function errorReport(issues: Issue[]) {
    // Failed rows only, in template format + reason, so the owner can fix and re-upload just these.
    const bySku = new Map(file?.rows.map((r) => [String(r.sku ?? "").trim(), r]));
    const rows = issues.map((i) => {
      const r = bySku.get(i.sku);
      return [r?.sku ?? i.sku, r?.nama ?? "", r?.brand ?? "", r?.kategori ?? "", r?.deskripsi ?? "", r?.harga ?? "",
        r?.stok ?? "", r?.berat ?? "", r?.panjang ?? "", r?.lebar ?? "", r?.tinggi ?? "", r?.bpom ?? "", ...(r?.fotos ?? Array(9).fill("")), r?.status ?? "", i.row, i.reason];
    });
    downloadBlob("laporan-error-upload.csv", csvBlob([...FULL_HEADERS, "Baris", "Alasan"], rows));
  }

  const lastInfo = lastImport.data?.last ?? null;
  const allIssues = preview ? [...preview.errors, ...preview.drafts].sort((a, b) => a.row - b.row) : [];
  const finalIssues = result ? [...result.issues, ...result.photoFails].sort((a, b) => a.row - b.row) : [];
  const chunks = file ? Math.ceil(file.rows.length / CHUNK) : 0;

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-base font-extrabold text-navy">Unggah Produk Massal</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Cocokkan per SKU. SKU baru = produk baru. Foto dari URL diunduh & disimpan ulang di toko (tidak hotlink).
        </p>
      </div>

      <section className="p-3 card-surface">
        <h2 className="text-sm font-bold text-navy">1. Unduh template</h2>
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={!!busy} onClick={() => void downloadTemplate("xlsx")}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
            <Download className="h-4 w-4" /> {busy === "xlsx" ? "Menyiapkan…" : "Unduh Template"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void downloadTemplate("csv")}
            className="rounded-full bg-secondary px-3 py-2.5 text-xs font-bold text-navy disabled:opacity-60">
            CSV
          </button>
        </div>
        <button type="button" disabled={!!busy} onClick={() => void downloadBlankTemplate()}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-secondary px-3 py-2.5 text-xs font-bold text-navy disabled:opacity-60">
          <FileSpreadsheet className="h-4 w-4" /> {busy === "blank" ? "Menyiapkan…" : "Template kosong + contoh & petunjuk"}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          "Unduh Template" berisi produk yang sudah ada (untuk memperbarui). Template kosong berisi baris CONTOH, pilihan
          Kategori/Status, dan sheet Petunjuk untuk pemula.
        </p>
      </section>

      <section className="p-3 card-surface">
        <h2 className="text-sm font-bold text-navy">2. Unggah file</h2>
        <label className="mt-2 flex items-start gap-2 text-xs text-navy">
          <input type="checkbox" checked={mode === "overwrite"} className="mt-0.5 h-4 w-4"
            onChange={(e) => {
              const m = e.target.checked ? "overwrite" : "fill";
              setMode(m);
              if (file) void onFile(new File([], file.name), m).catch(() => undefined);
            }} />
          <span>
            <b>Timpa</b> data yang sudah ada. Jika tidak dicentang: <b>hanya isi kolom kosong</b> (aman).
          </span>
        </label>
        <button type="button" disabled={!!busy} onClick={() => inputRef.current?.click()}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-full bg-secondary px-3 py-2.5 text-xs font-bold text-navy disabled:opacity-60">
          <FileUp className="h-4 w-4" /> {busy === "read" ? "Memeriksa…" : file ? `Ganti file (${file.name})` : "Pilih .xlsx / .csv"}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void onFile(f);
          }} />
      </section>

      {preview && (
        <section className="p-3 card-surface">
          <h2 className="text-sm font-bold text-navy">3. Pratinjau (belum disimpan)</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {[
              ["Baris", preview.totalRows],
              ["Baru", preview.newCount],
              ["Diperbarui", preview.updateCount],
              ["Tidak berubah", preview.unchanged],
              ["Error (tidak disimpan)", preview.errors.length],
              ["Tetap Draf", preview.drafts.length],
              ["Foto akan diunduh", preview.photoCount],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-secondary p-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-base font-extrabold text-navy">{Number(v).toLocaleString("id-ID")}</dd>
              </div>
            ))}
          </dl>
          {allIssues.length > 0 && (
            <>
              <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto text-xs">
                {allIssues.slice(0, 100).map((i) => (
                  <li key={`${i.row}-${i.reason}`} className="rounded-lg bg-destructive/10 px-2 py-1 text-destructive">
                    {formatIssue(i)}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => errorReport(allIssues)}
                className="mt-2 w-full rounded-full bg-secondary px-3 py-2 text-xs font-bold text-navy">
                Unduh Laporan Error
              </button>
            </>
          )}
          <button type="button"
            disabled={!!busy || preview.newCount + preview.updateCount === 0}
            onClick={() => void apply(nextChunk > 0 && nextChunk < chunks ? nextChunk : 0)}
            className="mt-3 w-full rounded-full bg-primary px-3 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy === "save" ? "Menyimpan…" : nextChunk > 0 && nextChunk < chunks ? `Lanjutkan dari batch ${nextChunk + 1}` : "Terapkan"}
          </button>
        </section>
      )}

      {progress && (
        <section className="p-3 card-surface" aria-live="polite">
          <p className="text-xs font-semibold text-navy">{progress.label}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
        </section>
      )}

      <section className="p-3 card-surface">
        <h2 className="text-sm font-bold text-navy">Salah unggah?</h2>
        {lastImport.isPending ? (
          <p className="mt-1 text-xs text-muted-foreground">Memeriksa riwayat impor…</p>
        ) : lastImport.isError ? (
          <p className="mt-1 text-xs text-muted-foreground">Riwayat impor belum bisa dibaca.</p>
        ) : lastInfo ? (
          <>
            <p className="mt-1 text-xs text-navy">
              Impor terakhir: <b>{lastInfo.fileName ?? "tanpa nama"}</b> ·{" "}
              {new Date(lastInfo.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
              {lastInfo.created} baru, {lastInfo.updated} diperbarui.
            </p>
            <button type="button" disabled={!!busy} onClick={() => void undoLast()}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-destructive/10 px-3 py-2.5 text-xs font-bold text-destructive disabled:opacity-60">
              <Undo2 className="h-4 w-4" /> {busy === "undo" ? "Membatalkan…" : "Batalkan impor terakhir"}
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Produk lama dikembalikan seperti sebelum impor. Produk baru diarsipkan (tidak dihapus). Foto yang sempat
              diunggah tetap tersimpan di penyimpanan tetapi tidak dipakai lagi.
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Belum ada impor yang bisa dibatalkan.</p>
        )}
      </section>

      {result && (
        <section className="p-3 card-surface">
          <h2 className="text-sm font-bold text-navy">Hasil</h2>
          <p className="mt-1 text-xs text-navy">
            {result.created} baru · {result.updated} diperbarui · {result.issues.length} gagal/tetap Draf · {result.photoFails.length} foto gagal
          </p>
          {finalIssues.length > 0 && (
            <button type="button" onClick={() => errorReport(finalIssues)}
              className="mt-2 w-full rounded-full bg-secondary px-3 py-2 text-xs font-bold text-navy">
              Unduh Laporan Error ({finalIssues.length})
            </button>
          )}
        </section>
      )}
    </div>
  );
}
