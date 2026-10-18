import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { Check, Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { applyShopeePhotos, previewShopeePhotos, type ShopeePreview } from "@/lib/shopee-photos.functions";
import { gridToShopeeRows, type ShopeeParse, type PlanMode } from "@/lib/shopee-photo-match";
import { csvBlob, downloadBlob, readGrid } from "@/lib/sheet-io";
import { hasPermission } from "@/lib/permissions";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/foto-shopee")({
  head: () => ({
    meta: [
      { title: "Foto dari Shopee — Seller Center | VitaminKu" },
      { name: "description", content: "Pasang foto produk dari file ekspor Shopee, dicocokkan per SKU atau nama." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FotoShopeePage,
});

const BATCH = 10; // produk per panggilan server (server menerima maks 25)
const LIST_STEP = 30;
const SKIP = "__lewati__";

type Fail = { sku: string; alasan: string };

function FotoShopeePage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const runPreview = useServerFn(previewShopeePhotos);
  const runApply = useServerFn(applyShopeePhotos);
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<PlanMode>("lewati");
  const [busy, setBusy] = useState<"read" | "apply" | null>(null);
  const [file, setFile] = useState<{ name: string; parsed: ShopeeParse } | null>(null);
  const [preview, setPreview] = useState<ShopeePreview | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState({ ok: 0, photos: 0, skipped: 0, failed: 0 });
  const [fails, setFails] = useState<Fail[]>([]);
  const [shownTinjau, setShownTinjau] = useState(LIST_STEP);
  const [shownPasti, setShownPasti] = useState(LIST_STEP);

  const pickCount = useMemo(() => Object.values(picks).filter((v) => v && v !== SKIP).length, [picks]);

  if (!hasPermission({ role }, "products_photos")) {
    return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk tim produk, admin, dan owner.</p>;
  }

  async function check(parsed: ShopeeParse, m: PlanMode) {
    setBusy("read");
    try {
      setPreview(await runPreview({ data: { rows: parsed.rows, mode: m } }));
    } finally {
      setBusy(null);
    }
  }

  function resetRun() {
    setPicks({});
    setDone(new Set());
    setProgress(null);
    setSummary({ ok: 0, photos: 0, skipped: 0, failed: 0 });
    setFails([]);
    setShownTinjau(LIST_STEP);
    setShownPasti(LIST_STEP);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy("read");
    setPreview(null);
    resetRun();
    try {
      const parsed = gridToShopeeRows(await readGrid(f));
      if (parsed.rows.length === 0) throw new Error("Tidak ada baris dengan SKU atau URL foto di file ini.");
      setFile({ name: f.name, parsed });
      await check(parsed, mode);
    } catch (e) {
      setFile(null);
      toast.error(e instanceof Error ? e.message : "File tidak bisa dibaca");
      setBusy(null);
    }
  }

  async function changeMode(m: PlanMode) {
    setMode(m);
    if (!file) return;
    resetRun();
    try {
      await check(file.parsed, m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pratinjau gagal");
    }
  }

  async function apply() {
    if (!file || !preview) return;
    const items = [
      ...preview.pasti.map((p) => ({ key: p.key, productId: p.produk.id, pilihan: false })),
      ...Object.entries(picks)
        .filter(([, v]) => v && v !== SKIP)
        .map(([key, productId]) => ({ key, productId, pilihan: true })),
    ].filter((it) => !done.has(it.key));
    if (items.length === 0) {
      toast.message("Tidak ada foto yang perlu dipasang.");
      return;
    }
    const pastiN = items.filter((i) => !i.pilihan).length;
    const ok = window.confirm(
      `Pasang foto ke ${pastiN} produk yang cocok pasti` +
        (items.length > pastiN ? ` dan ${items.length - pastiN} produk pilihan Anda` : "") +
        `?\n\nFoto diunduh dari link Shopee lalu disimpan di toko (tidak memakai link Shopee). ` +
        (mode === "timpa"
          ? "Foto lama pada produk tersebut AKAN DIGANTI."
          : "Produk yang sudah punya foto dilewati.") +
        `\n\nBaris yang perlu ditinjau tidak dipasang kecuali Anda sudah memilih produknya.`,
    );
    if (!ok) return;

    setBusy("apply");
    const rows = file.parsed.rows.filter((r) => r.urls.length > 0);
    const doneNow = new Set(done);
    const sum = { ...summary };
    const failList = [...fails];
    setProgress({ done: 0, total: items.length });
    try {
      for (let i = 0; i < items.length; i += BATCH) {
        const chunk = items.slice(i, i + BATCH);
        const res = await runApply({ data: { rows, mode, items: chunk } });
        for (const r of res.results) {
          if (r.status === "ok") {
            sum.ok++;
            sum.photos += r.stored;
            doneNow.add(r.key);
          } else if (r.status === "dilewati") {
            sum.skipped++;
            doneNow.add(r.key);
          } else {
            sum.failed++;
            failList.push({ sku: r.sku, alasan: r.alasan ?? "gagal" });
          }
          for (const g of r.gagalFoto) failList.push({ sku: r.sku, alasan: `Foto gagal (${g.alasan}): ${g.url}` });
        }
        for (const d of res.ditolak) {
          sum.skipped++;
          doneNow.add(d.key);
          failList.push({ sku: `baris ${d.key}`, alasan: `Ditolak server: ${d.alasan}` });
        }
        setDone(new Set(doneNow));
        setSummary({ ...sum });
        setFails([...failList]);
        setProgress({ done: Math.min(items.length, i + chunk.length), total: items.length });
      }
      toast.success(`Selesai: ${sum.ok} produk dapat foto.`);
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "Gagal"} — tekan tombol lagi untuk melanjutkan; yang sudah selesai tidak diulang.`, {
        duration: 10000,
      });
    } finally {
      setBusy(null);
    }
  }

  function downloadReport() {
    if (!preview) return;
    const rows: unknown[][] = [
      ...preview.galat.map((g) => [g.row, g.sku, g.name, g.jenis === "url_rusak" ? "URL rusak" : g.jenis === "tanpa_foto" ? "Tanpa foto" : "Tidak cocok", g.alasan]),
      ...preview.tinjau
        .filter((t) => !picks[t.key] || picks[t.key] === SKIP)
        .map((t) => [t.row, t.sku, t.name, "Perlu ditinjau", t.alasan]),
      ...preview.dilewati.map((d) => [d.row, d.sku, d.name, "Dilewati", d.alasan]),
      ...fails.map((f) => ["", f.sku, "", "Gagal saat memasang", f.alasan]),
    ];
    downloadBlob("laporan-foto-shopee.csv", csvBlob(["Baris", "SKU", "Nama (Shopee)", "Status", "Alasan"], rows));
  }

  const nPasti = preview?.pasti.length ?? 0;
  const nTinjau = preview?.tinjau.length ?? 0;
  const nGalat = preview?.galat.length ?? 0;
  const nDilewati = preview?.dilewati.length ?? 0;
  const pending = preview ? preview.pasti.filter((p) => !done.has(p.key)).length + Object.entries(picks).filter(([k, v]) => v && v !== SKIP && !done.has(k)).length : 0;

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-base font-extrabold text-navy">Foto dari Shopee</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Unggah file ekspor produk Shopee (.xlsx/.csv). Foto dipasang ke produk yang cocok per SKU, atau per nama bila SKU kosong.
          Foto diunduh lalu disimpan di toko (WebP 800 px + thumbnail), tidak memakai link Shopee.
          Yang meragukan tidak dipasang otomatis: Anda yang memilih.
        </p>
      </div>

      <section className="p-3 card-surface">
        <h2 className="text-sm font-bold text-navy">1. Pilih file</h2>
        <label className="mt-2 flex min-h-11 items-start gap-2 text-xs text-navy">
          <input type="checkbox" checked={mode === "timpa"} disabled={!!busy} className="mt-0.5 h-5 w-5"
            onChange={(e) => void changeMode(e.target.checked ? "timpa" : "lewati")} />
          <span>
            <b>Timpa</b> foto yang sudah ada. Jika tidak dicentang, produk yang sudah punya foto <b>dilewati</b> (aman).
          </span>
        </label>
        <button type="button" disabled={!!busy} onClick={() => inputRef.current?.click()}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
          <FileUp className="h-4 w-4" /> {busy === "read" ? "Memeriksa…" : file ? `Ganti file (${file.name})` : "Pilih .xlsx / .csv"}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void onFile(f);
          }} />
        {file && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Terbaca {file.parsed.rows.length.toLocaleString("id-ID")} baris. Kolom SKU: {file.parsed.info.skuHeaders.join(", ") || "tidak ada"} ·
            Nama: {file.parsed.info.nameHeader ?? "tidak ada"} · Foto: {file.parsed.info.imageHeaders.length} kolom.
          </p>
        )}
      </section>

      {preview && (
        <section className="p-3 card-surface">
          <h2 className="text-sm font-bold text-navy">2. Pratinjau (belum ada yang disimpan)</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {[
              ["Siap dipasang", nPasti],
              ["Perlu ditinjau", nTinjau],
              ["Tidak cocok / galat", nGalat],
              ["Dilewati", nDilewati],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-secondary p-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-base font-extrabold text-navy">{Number(v).toLocaleString("id-ID")}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Produk tanpa foto di toko: {preview.produkTanpaFoto.toLocaleString("id-ID")}. Dari file ini yang pasti cocok:{" "}
            {preview.produkTanpaFotoTertutup.toLocaleString("id-ID")}.
          </p>
        </section>
      )}

      {preview && nPasti > 0 && (
        <details className="p-3 card-surface">
          <summary className="min-h-11 cursor-pointer text-sm font-bold text-navy">Siap dipasang ({nPasti.toLocaleString("id-ID")})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {preview.pasti.slice(0, shownPasti).map((p) => (
              <li key={p.key} className="rounded-lg bg-secondary px-2 py-1.5">
                <span className="font-semibold text-navy">{p.produk.sku}</span> · {p.produk.name}
                <span className="block text-muted-foreground">
                  baris {p.row} · {p.jumlahFoto} foto · cocok lewat {p.dasar === "sku" ? "SKU" : "nama"}
                  {done.has(p.key) ? " · sudah dipasang" : ""}
                </span>
              </li>
            ))}
          </ul>
          {shownPasti < nPasti && (
            <button type="button" onClick={() => setShownPasti((n) => n + 100)}
              className="mt-2 min-h-11 w-full rounded-full bg-secondary px-3 text-xs font-bold text-navy">
              Tampilkan lebih banyak
            </button>
          )}
        </details>
      )}

      {preview && nTinjau > 0 && (
        <section className="p-3 card-surface">
          <h2 className="text-sm font-bold text-navy">Perlu ditinjau ({nTinjau.toLocaleString("id-ID")})</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tidak dipasang otomatis. Pilih produk yang benar lalu tekan &quot;Pakai produk ini&quot;, atau &quot;Lewati&quot;.
            Pilihan ikut terpasang saat Anda menekan tombol terapkan di bawah.
          </p>
          <ul className="mt-2 space-y-2">
            {preview.tinjau.slice(0, shownTinjau).map((t) => {
              const chosen = picks[t.key];
              return (
                <li key={t.key} className="rounded-lg border border-border p-2 text-xs">
                  <p className="font-semibold text-navy">
                    Baris {t.row} · {t.sku || "tanpa SKU"} · {t.jumlahFoto} foto
                  </p>
                  <p className="text-navy">{t.name || "(tanpa nama)"}</p>
                  <p className="mt-1 text-destructive">{t.alasan}</p>
                  {done.has(t.key) && <p className="mt-1 font-semibold text-navy">Sudah dipasang.</p>}
                  <ul className="mt-2 space-y-1">
                    {t.kandidat.map((k) => {
                      const selected = chosen === k.id;
                      return (
                        <li key={k.id} className="flex items-center gap-2 rounded-lg bg-secondary px-2 py-1">
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold text-navy">{k.sku}</span> · {k.name}
                            <span className="block text-muted-foreground">
                              {k.fotoAda > 0 ? `sudah ${k.fotoAda} foto` : "belum ada foto"}
                            </span>
                          </span>
                          <button type="button" disabled={!!busy || done.has(t.key)}
                            onClick={() => setPicks((p) => ({ ...p, [t.key]: selected ? "" : k.id }))}
                            className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold disabled:opacity-60 ${
                              selected ? "bg-primary text-primary-foreground" : "bg-background text-navy"
                            }`}>
                            {selected && <Check className="h-4 w-4" />} {selected ? "Dipilih" : "Pakai produk ini"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" disabled={!!busy || done.has(t.key)}
                    onClick={() => setPicks((p) => ({ ...p, [t.key]: chosen === SKIP ? "" : SKIP }))}
                    className={`mt-2 min-h-11 w-full rounded-full px-3 text-xs font-bold disabled:opacity-60 ${
                      chosen === SKIP ? "bg-navy text-white" : "bg-secondary text-navy"
                    }`}>
                    {chosen === SKIP ? "Dilewati (ketuk untuk batal)" : "Lewati"}
                  </button>
                </li>
              );
            })}
          </ul>
          {shownTinjau < nTinjau && (
            <button type="button" onClick={() => setShownTinjau((n) => n + LIST_STEP)}
              className="mt-2 min-h-11 w-full rounded-full bg-secondary px-3 text-xs font-bold text-navy">
              Tampilkan lebih banyak ({nTinjau - shownTinjau} lagi)
            </button>
          )}
        </section>
      )}

      {preview && (nGalat > 0 || nDilewati > 0) && (
        <details className="p-3 card-surface">
          <summary className="min-h-11 cursor-pointer text-sm font-bold text-navy">
            Tidak cocok / galat ({nGalat.toLocaleString("id-ID")}) dan dilewati ({nDilewati.toLocaleString("id-ID")})
          </summary>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs">
            {preview.galat.slice(0, 200).map((g) => (
              <li key={`g${g.key}`} className="rounded-lg bg-destructive/10 px-2 py-1 text-destructive">
                Baris {g.row} ({g.sku || g.name.slice(0, 30) || "?"}): {g.alasan}
              </li>
            ))}
            {preview.dilewati.slice(0, 200).map((d) => (
              <li key={`d${d.key}`} className="rounded-lg bg-secondary px-2 py-1 text-navy">
                Baris {d.row} ({d.produkSku ?? d.sku}): {d.alasan}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">Daftar di layar dibatasi 200 baris per jenis; laporan CSV berisi semuanya.</p>
        </details>
      )}

      {preview && (
        <section className="p-3 card-surface">
          <h2 className="text-sm font-bold text-navy">3. Terapkan</h2>
          <button type="button" disabled={!!busy || pending === 0} onClick={() => void apply()}
            className="mt-2 min-h-11 w-full rounded-full bg-primary px-3 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy === "apply"
              ? "Memasang foto…"
              : pickCount > 0
                ? `Terapkan yang pasti + ${pickCount} pilihan saya (${pending})`
                : `Terapkan yang pasti (${pending})`}
          </button>
          <button type="button" disabled={!!busy} onClick={downloadReport}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-secondary px-3 py-2.5 text-xs font-bold text-navy disabled:opacity-60">
            <Download className="h-4 w-4" /> Unduh laporan CSV (tidak cocok, ditinjau, dilewati, gagal)
          </button>
        </section>
      )}

      {progress && (
        <section className="p-3 card-surface" aria-live="polite">
          <p className="text-xs font-semibold text-navy">
            {progress.done}/{progress.total} produk diproses · {summary.ok} berhasil ({summary.photos} foto) · {summary.skipped} dilewati ·{" "}
            {summary.failed} gagal
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          {fails.length > 0 && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {fails.slice(-50).map((f, i) => (
                <li key={i} className="rounded-lg bg-destructive/10 px-2 py-1 text-destructive">
                  {f.sku}: {f.alasan}
                </li>
              ))}
            </ul>
          )}
          {busy !== "apply" && summary.failed > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Yang gagal belum ditandai selesai: tekan tombol terapkan lagi untuk mencoba ulang hanya yang gagal.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
