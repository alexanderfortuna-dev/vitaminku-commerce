import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Database, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { exportBackup, listRecentErrors } from "@/lib/backup.functions";
import { BACKUP_KINDS, BACKUP_LABEL, backupFilename, type BackupKind } from "@/lib/backup-core";
import { csvBlob, downloadBlob, downloadXlsx } from "@/lib/sheet-io";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/cadangan")({
  head: () => ({
    meta: [
      { title: "Cadangan Data — Panel Admin | VitaminKu" },
      { name: "description", content: "Unduh cadangan produk, pelanggan, dan pesanan VitaminKu (khusus owner)." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BackupPage,
});

const HINT: Record<BackupKind, string> = {
  produk: "Semua produk (Live, Draf, diblokir). Foto utama dan jumlah foto; harga modal ikut hanya bila akunmu berhak melihatnya.",
  pelanggan: "Data pribadi pelanggan (nama, WhatsApp, email, alamat). Simpan dengan aman dan jangan dibagikan.",
  pesanan: "Semua pesanan beserta alamat kirim. Token akses dan tautan bayar tidak disertakan.",
  item_pesanan: "Rincian barang per pesanan. Sambungkan ke Pesanan lewat kolom ID_pesanan.",
};

const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

function BackupPage() {
  const role = useAdminRole().data?.role ?? null;
  const isOwner = role === "owner";
  const runExport = useServerFn(exportBackup);
  const fetchErrors = useServerFn(listRecentErrors);
  const [busy, setBusy] = useState<string | null>(null);
  const errors = useQuery({ queryKey: ["recent-errors"], queryFn: () => fetchErrors(), enabled: isOwner, retry: false });

  if (!isOwner) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk Owner.</p>;

  async function download(kind: BackupKind, ext: "xlsx" | "csv") {
    if (kind === "pelanggan" && !window.confirm("File ini berisi data pribadi pelanggan. Lanjut unduh?")) return;
    setBusy(`${kind}-${ext}`);
    try {
      const r = await runExport({ data: { kind } });
      const name = backupFilename(kind, ext);
      if (ext === "csv") downloadBlob(name, csvBlob(r.header, r.rows));
      else await downloadXlsx(name, BACKUP_LABEL[kind], r.header, r.rows, r.header.map(() => 18));
      toast.success(`${r.count.toLocaleString("id-ID")} baris diunduh${r.includesCost ? " (termasuk harga modal)" : ""}.`);
      if (r.truncated) toast.warning("Data sangat besar, hanya 50.000 baris pertama yang diunduh. Hubungi pengembang untuk cadangan penuh.", { duration: 10000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunduh cadangan");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h1 className="flex items-center gap-2 text-base font-extrabold text-navy">
          <Database className="h-5 w-5" /> Cadangan Data
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Unduh salinan data toko ke Excel atau CSV. Setiap unduhan tercatat di Aktivitas. Ini salinan untuk disimpan sendiri,
          bukan pengganti cadangan otomatis database.
        </p>
      </div>

      {BACKUP_KINDS.map((kind) => (
        <section key={kind} className="p-3 card-surface">
          <h2 className="text-sm font-bold text-navy">{BACKUP_LABEL[kind]}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{HINT[kind]}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={!!busy} onClick={() => void download(kind, "xlsx")}
              className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
              <Download className="h-4 w-4" /> {busy === `${kind}-xlsx` ? "Menyiapkan…" : "Unduh Excel"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void download(kind, "csv")}
              className="min-h-11 rounded-full bg-secondary px-4 py-2.5 text-xs font-bold text-navy disabled:opacity-60">
              {busy === `${kind}-csv` ? "…" : "CSV"}
            </button>
          </div>
        </section>
      ))}

      <section className="p-3 card-surface">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-navy">Galat terbaru</h2>
          <button type="button" onClick={() => void errors.refetch()} disabled={errors.isFetching} aria-label="Muat ulang"
            className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-navy disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${errors.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Hanya galat sejak fitur ini aktif. Isinya dipotong dan dibersihkan dari email, nomor telepon, token, dan query URL.
        </p>
        {errors.isPending ? (
          <p className="mt-2 text-xs text-muted-foreground">Memuat…</p>
        ) : errors.isError ? (
          <p className="mt-2 text-xs text-destructive">Catatan galat belum bisa dibaca.</p>
        ) : errors.data.errors.length === 0 ? (
          <p className="mt-2 text-xs text-navy">Belum ada galat tercatat.</p>
        ) : (
          <>
            <p className="mt-2 text-xs font-semibold text-navy">{errors.data.last24h} galat dalam 24 jam terakhir</p>
            <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto text-xs">
              {errors.data.errors.map((e) => (
                <li key={e.id} className="rounded-lg bg-secondary px-2 py-1.5 text-navy">
                  <span className="font-semibold">{e.source === "server" ? "Server" : "Browser"}</span>
                  <span className="text-muted-foreground"> · {when(e.at)}{e.path ? ` · ${e.path}` : ""}</span>
                  <br />
                  <span className="break-words">{e.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
