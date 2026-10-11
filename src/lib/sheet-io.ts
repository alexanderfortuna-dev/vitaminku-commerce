// Browser-only spreadsheet helpers (exceljs is loaded lazily, never on the server).
import { csvEscape, parseCsv, type RawCell } from "./bulk-price-stock";

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function loadExcel() {
  if (import.meta.env.SSR) throw new Error("Excel hanya tersedia di browser.");
  return (await import("exceljs")).default;
}

function cellValue(v: unknown): RawCell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; hyperlink?: unknown; richText?: Array<{ text: string }> };
    if (o.result !== undefined) return cellValue(o.result);
    if (typeof o.hyperlink === "string" && typeof o.text !== "string") return o.hyperlink;
    if (typeof o.text === "string") return o.text;
    if (o.richText) return o.richText.map((t) => t.text).join("");
  }
  return String(v);
}

/** Reads the first sheet of an .xlsx or a .csv into a grid (header row first). */
export async function readGrid(file: File): Promise<RawCell[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Gunakan file .xlsx atau .csv.");
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File tidak berisi sheet.");
  const grid: RawCell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    grid[n - 1] = (row.values as unknown[]).slice(1).map(cellValue);
  });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
}

export async function downloadXlsx(name: string, sheet: string, header: readonly string[], rows: unknown[][], widths: number[]) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...header]);
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true };
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(name, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export function csvBlob(header: readonly string[], rows: unknown[][]) {
  const text = [header.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  return new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
}

export const formatRp = (n: number | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(n).toLocaleString("id-ID")}`;
