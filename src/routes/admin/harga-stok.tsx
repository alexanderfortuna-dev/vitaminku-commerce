import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import {
  applyPriceStockImport,
  exportPriceStock,
  previewPriceStockImport,
} from "@/lib/bulk-price-stock.functions";
import {
  TEMPLATE_HEADERS,
  csvEscape,
  gridToRows,
  parseCsv,
  type RawCell,
  type RawRow,
  type RowError,
} from "@/lib/bulk-price-stock";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/harga-stok")({
  head: () => ({
    meta: [
      { title: "Ubah Harga & Stok — Seller Center | VitaminKu" },
      { name: "description", content: "Unduh template dan impor harga serta stok produk VitaminKu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BulkPriceStockPage,
});

type Preview = Awaited<ReturnType<typeof previewPriceStockImport>>;
type Applied = Awaited<ReturnType<typeof applyPriceStockImport>>;

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cellValue(v: unknown): RawCell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (o.result !== undefined) return cellValue(o.result);
    if (typeof o.text === "string") return o.text;
    if (o.richText) return o.richText.map((t) => t.text).join("");
  }
  return String(v);
}

async function readFile(file: File): Promise<RawRow[]> {
  if (/\.csv$/i.test(file.name)) return gridToRows(parseCsv(await file.text()));
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Gunakan file .xlsx atau .csv.");
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File tidak berisi sheet.");
  const grid: RawCell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const values = row.values as unknown[]; // 1-indexed
    grid[n - 1] = values.slice(1).map(cellValue);
  });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return gridToRows(grid);
}

function errorsCsv(rows: RowError[]) {
  const lines = ["baris,sku,alasan", ...rows.map((e) => [e.row, e.sku, e.reason].map(csvEscape).join(","))];
  return new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
}

function BulkPriceStockPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const fetchExport = useServerFn(exportPriceStock);
  const runPreview = useServerFn(previewPriceStockImport);
  const runApply = useServerFn(applyPriceStockImport);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "xlsx" | "csv" | "read" | "save">(null);
  const [file, setFile] = useState<{ name: string; rows: RawRow[] } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  if (!canEditCommerce(role)) {
    return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk admin/owner.</p>;
  }

  async function exportTemplate(kind: "xlsx" | "csv") {
    setBusy(kind);
    try {
      const { products } = await fetchExport();
      const rows = products.map((p) => [
        p.sku,
        p.name,
        p.brand,
        p.category,
        p.price ?? "",
        p.compare_at_price ?? "",
        p.stock,
      ]);
      const date = new Date().toISOString().slice(0, 10);
      if (kind === "csv") {
        const text = [TEMPLATE_HEADERS.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
        download(`template-harga-stok-${date}.csv`, new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
      } else {
        const ExcelJS = await loadExcel();
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Harga & Stok", { views: [{ state: "frozen", ySplit: 1 }] });
        ws.addRow([...TEMPLATE_HEADERS]);
        ws.addRows(rows);
        ws.getRow(1).font = { bold: true };
        [18, 48, 20, 26, 14, 14, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));
        const buf = await wb.xlsx.writeBuffer();
        download(
          `template-harga-stok-${date}.xlsx`,
          new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        );
      }
      toast.success(`${products.length} produk diunduh`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunduh template");
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
      const rows = await readFile(f);
      setFile({ name: f.name, rows });
      setPreview(await runPreview({ data: { rows, fileName: f.name } }));
    } catch (e) {
      setFile(null);
      toast.error(e instanceof Error ? e.message : "File tidak bisa dibaca");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function save() {
    if (!file) return;
    setBusy("save");
    try {
      const result = await runApply({ data: { rows: file.rows, fileName: file.name } });
      setApplied(result);
      setPreview(null);
      if (result.failed) toast.error(`${result.failed} produk gagal disimpan`);
      else toast.success(`${result.updated} produk diperbarui`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(null);
    }
  }

  const previewErrors = preview ? [...preview.invalid, ...preview.unknownSku].sort((a, b) => a.row - b.row) : [];

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link to="/admin" aria-label="Kembali" className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-navy">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-extrabold text-navy">Ubah Harga & Stok</h1>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold text-navy">1. Unduh Template</p>
        <p className="text-xs text-muted-foreground">
          Isi kolom harga_jual, harga_coret, dan stok. Kolom sku dan nama_produk hanya acuan — jangan diubah. Sel
          kosong = tidak diubah.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => exportTemplate("xlsx")}
            disabled={busy !== null}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {busy === "xlsx" ? "Menyiapkan…" : "Unduh Template"}
          </button>
          <button
            type="button"
            onClick={() => exportTemplate("csv")}
            disabled={busy !== null}
            className="rounded-full border border-primary px-4 py-3 text-sm font-bold text-primary disabled:opacity-50"
          >
            {busy === "csv" ? "…" : "CSV"}
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold text-navy">2. Unggah File (.xlsx / .csv)</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-secondary px-4 py-3 text-sm font-bold text-navy disabled:opacity-50"
        >
          <FileUp className="h-4 w-4" />
          {busy === "read" ? "Memeriksa file…" : "Pilih File"}
        </button>
        {file && <p className="truncate text-xs text-muted-foreground">File: {file.name}</p>}
      </section>

      {preview && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold text-navy">3. Pratinjau (belum disimpan)</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Akan diperbarui" value={preview.willUpdate} />
            <Stat label="Tidak berubah" value={preview.unchanged} />
            <Stat label="SKU tidak dikenal" value={preview.unknownSku.length} />
            <Stat label="Baris tidak valid" value={preview.invalid.length} />
          </dl>
          {previewErrors.length > 0 && (
            <>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {previewErrors.slice(0, 50).map((e) => (
                  <li key={`${e.row}-${e.sku}`}>
                    Baris {e.row} · {e.sku || "—"}: {e.reason}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => download("daftar-error-impor.csv", errorsCsv(previewErrors))}
                className="w-full rounded-full border border-border px-4 py-2 text-sm font-bold text-navy"
              >
                Unduh Daftar Error ({previewErrors.length})
              </button>
            </>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy !== null || preview.willUpdate === 0}
            className="w-full rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy === "save" ? "Menyimpan…" : `Simpan Perubahan (${preview.willUpdate})`}
          </button>
        </section>
      )}

      {applied && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold text-navy">Selesai</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Diperbarui" value={applied.updated} />
            <Stat label="Gagal" value={applied.failed} />
            <Stat label="Tidak berubah" value={applied.unchanged} />
            <Stat label="Dilewati" value={applied.unknownSku + applied.invalid} />
          </dl>
          {applied.failed > 0 && (
            <button
              type="button"
              onClick={() =>
                download(
                  "gagal-disimpan.csv",
                  errorsCsv(applied.failedRows.map((f) => ({ row: 0, sku: f.sku, reason: f.reason }))),
                )
              }
              className="w-full rounded-full border border-border px-4 py-2 text-sm font-bold text-navy"
            >
              Unduh Daftar Gagal
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-extrabold text-navy">{value.toLocaleString("id-ID")}</dd>
    </div>
  );
}

/** Browser-only: keeps exceljs (Node CommonJS) out of the server bundle, which crashes the live site. */
async function loadExcel() {
  if (import.meta.env.SSR) throw new Error("Excel hanya tersedia di browser.");
  return (await import("exceljs")).default;
}
