// Browser-only spreadsheet helpers (exceljs is loaded lazily, never on the server).
import { csvEscape, parseCsv, type RawCell } from "./bulk-price-stock";
import { FULL_HEADERS } from "./seller-import";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_DATA_SHEET,
  TEMPLATE_HELP_SHEET,
  TEMPLATE_LISTS_SHEET,
  TEMPLATE_STATUSES,
  templateInstructionLines,
  templateSampleRows,
} from "./import-template";

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

const TEMPLATE_VALIDATION_ROWS = 1000;

/** Template kosong: sheet Data (baris CONTOH + dropdown Kategori/Status), sheet Petunjuk, dan sheet Daftar (isi dropdown). */
export async function downloadImportTemplateXlsx(name: string) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(TEMPLATE_DATA_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...FULL_HEADERS]);
  ws.addRows(templateSampleRows());
  ws.getRow(1).font = { bold: true };
  [18, 44, 18, 26, 40, 12, 8, 11, 16, ...Array(9).fill(28), 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getRows(2, 2)?.forEach((r) => (r.font = { italic: true, color: { argb: "FF6B7280" } }));

  const lists = wb.addWorksheet(TEMPLATE_LISTS_SHEET, { state: "hidden" });
  TEMPLATE_CATEGORIES.forEach((c, i) => (lists.getCell(i + 1, 1).value = c));
  TEMPLATE_STATUSES.forEach((c, i) => (lists.getCell(i + 1, 2).value = c));

  const col = (header: string) => FULL_HEADERS.indexOf(header as (typeof FULL_HEADERS)[number]) + 1;
  const catRef = `${TEMPLATE_LISTS_SHEET}!$A$1:$A$${TEMPLATE_CATEGORIES.length}`;
  const statusRef = `${TEMPLATE_LISTS_SHEET}!$B$1:$B$${TEMPLATE_STATUSES.length}`;
  for (let r = 2; r <= TEMPLATE_VALIDATION_ROWS; r++) {
    ws.getCell(r, col("Kategori")).dataValidation = {
      type: "list", allowBlank: true, formulae: [catRef], showErrorMessage: true, errorStyle: "warning",
      errorTitle: "Kategori tidak dikenal", error: "Pilih salah satu kategori dari daftar.",
    };
    ws.getCell(r, col("Status")).dataValidation = {
      type: "list", allowBlank: true, formulae: [statusRef], showErrorMessage: true, errorStyle: "stop",
      errorTitle: "Status tidak dikenal", error: "Pilih Live atau Draf.",
    };
  }

  const help = wb.addWorksheet(TEMPLATE_HELP_SHEET);
  help.getColumn(1).width = 120;
  templateInstructionLines().forEach((line, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (i === 0 || (line && !/^[\d\-]/.test(line) && !line.includes(" : ") && line.length < 40)) cell.font = { bold: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(name, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
