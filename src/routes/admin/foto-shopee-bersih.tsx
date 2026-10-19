import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CLEAN_APPLY_BATCH,
  CONFIRM_WORD,
  applyShopeeClean,
  decideShopeeReview,
  listShopeeReview,
  previewShopeeClean,
  saveShopeeReviewQueue,
  type CleanPreview,
  type ReviewCard,
} from "@/lib/shopee-clean.functions";
import { csvBlob, downloadBlob } from "@/lib/sheet-io";
import { hasPermission } from "@/lib/permissions";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/foto-shopee-bersih")({
  head: () => ({
    meta: [
      { title: "Foto Produk dari Shopee — Seller Center | VitaminKu" },
      { name: "description", content: "Cek, pasang foto yang yakin cocok, dan pilih sendiri foto untuk yang ragu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FotoBersihPage,
});

const card = "rounded-xl border border-border bg-card p-4";
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold disabled:opacity-50";

function FotoBersihPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const runPreview = useServerFn(previewShopeeClean);
  const runSave = useServerFn(saveShopeeReviewQueue);
  const runApply = useServerFn(applyShopeeClean);
  const runList = useServerFn(listShopeeReview);
  const runDecide = useServerFn(decideShopeeReview);
  const inputRef = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<CleanPreview | null>(null);
  const [busy, setBusy] = useState<"read" | "apply" | null>(null);
  const [word, setWord] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ ok: number; photos: number; skipped: number; failed: Array<{ sku: string; alasan: string }>; queued: number } | null>(null);

  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [pending, setPending] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const allowed = hasPermission({ role }, "products_photos");

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await runList({ data: { offset: 0 } });
      setCards(r.cards);
      setPending(r.pendingProducts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Antrean gagal dimuat");
    } finally {
      setLoadingList(false);
    }
  }, [runList]);

  useEffect(() => {
    if (allowed) void loadList();
  }, [allowed, loadList]);

  if (!allowed) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk tim produk, admin, dan owner.</p>;

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy("read");
    setPreview(null);
    setReport(null);
    setWord("");
    try {
      const text = await f.text();
      setCsv({ name: f.name, text });
      setPreview(await runPreview({ data: { csvText: text } }));
    } catch (e) {
      setCsv(null);
      toast.error(e instanceof Error ? e.message : "File tidak bisa diproses");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!csv || !preview || word.trim() !== CONFIRM_WORD) return;
    setBusy("apply");
    const sum = { ok: 0, photos: 0, skipped: 0, failed: [] as Array<{ sku: string; alasan: string }>, queued: 0 };
    try {
      const q = await runSave({ data: { csvText: csv.text, confirm: CONFIRM_WORD } });
      sum.queued = q.products;
      const ids = preview.autoProductIds;
      const total = ids.length;
      setProgress({ done: 0, total });
      for (let offset = 0; offset < total; offset += CLEAN_APPLY_BATCH) {
        const res = await runApply({ data: { csvText: csv.text, confirm: CONFIRM_WORD, productIds: ids.slice(offset, offset + CLEAN_APPLY_BATCH) } });
        for (const r of res.results) {
          if (r.status === "ok") {
            sum.ok++;
            sum.photos += r.stored;
          } else if (r.status === "dilewati") sum.skipped++;
          else sum.failed.push({ sku: r.sku, alasan: r.alasan ?? "gagal" });
        }
        setProgress({ done: Math.min(total, offset + CLEAN_APPLY_BATCH), total });
      }
      setReport({ ...sum });
      toast.success("Selesai.");
    } catch (e) {
      setReport({ ...sum });
      toast.error(e instanceof Error ? e.message : "Terhenti. Klik lagi untuk melanjutkan (yang sudah berfoto dilewati).");
    } finally {
      setBusy(null);
      setProgress(null);
      void loadList();
    }
  }

  async function decide(productId: string, candidateId: string | null) {
    setWorking(candidateId ?? productId);
    try {
      const r = await runDecide({ data: { productId, candidateId } });
      if (r.status === "gagal") toast.error(r.alasan ?? "Gagal");
      else {
        toast.success(r.status === "applied" ? "Foto terpasang" : r.alasan ?? "Dilewati");
        setCards((c) => c.filter((x) => x.productId !== productId));
        setPending((n) => Math.max(0, n - 1));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-lg font-extrabold text-navy">Foto Produk dari Shopee</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nama, deskripsi, dan kategori produk Anda tidak pernah diubah. Foto diunduh lalu disimpan di toko (WebP 800 px + thumbnail 400 px), bukan memakai link Shopee.
        </p>
      </header>

      <section className={card}>
        <h2 className="text-sm font-extrabold text-navy">1. Cek dulu (tidak menyimpan apa pun)</h2>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button type="button" disabled={busy !== null} onClick={() => inputRef.current?.click()} className={`${btn} mt-3 bg-primary text-primary-foreground`}>
          {busy === "read" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Pilih file CSV
        </button>
        {csv && <p className="mt-2 text-xs text-muted-foreground">{csv.name}</p>}

        {preview && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Foto yakin cocok (auto)" value={preview.stats.auto} tone="text-primary" />
              <Stat label="Perlu ditinjau" value={preview.stats.review} tone="text-navy" />
              <Stat label="Tanpa pasangan" value={preview.stats.unmatched} tone="text-muted-foreground" />
              <Stat label="Sudah berfoto (dilewati)" value={preview.stats.skippedHasPhoto} tone="text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              Dicek terhadap {preview.stats.products.toLocaleString("id-ID")} produk aktif tanpa foto dan {preview.stats.shopeeItems.toLocaleString("id-ID")} baris Shopee.
            </p>
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">10 contoh pasangan auto (cek sendiri)</h3>
            <ul className="space-y-2">
              {preview.samples.map((s) => (
                <li key={s.sku} className="rounded-lg bg-secondary p-3 text-xs">
                  <p className="font-bold text-navy">{s.vitaminku}</p>
                  <p className="mt-0.5 text-muted-foreground">↔ {s.shopee}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">keyakinan {s.confidence.toFixed(2)} · {s.photos} foto</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${btn} border border-border text-navy`}
                onClick={() =>
                  downloadBlob("foto-shopee-perlu-ditinjau.csv", csvBlob(["sku", "nama_vitaminku", "alasan", "saran_terbaik", "skor"], preview.review.map((r) => [r.sku, r.vitaminku, r.reason, r.best, r.bestScore])))
                }
              >
                <Download className="h-4 w-4" /> Perlu ditinjau (CSV)
              </button>
              <button
                type="button"
                className={`${btn} border border-border text-navy`}
                onClick={() => downloadBlob("foto-shopee-tanpa-pasangan.csv", csvBlob(["sku", "nama_vitaminku"], preview.unmatched.map((u) => [u.sku, u.vitaminku])))}
              >
                <Download className="h-4 w-4" /> Tanpa pasangan (CSV)
              </button>
            </div>
          </div>
        )}
      </section>

      {preview && (
        <section className={card}>
          <h2 className="text-sm font-extrabold text-navy">2. Terapkan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Memasang foto ke {preview.stats.auto} produk yang yakin cocok dan menyimpan {preview.stats.review} produk ke antrean tinjau di bawah. Ketik <b>{CONFIRM_WORD}</b> untuk melanjutkan.
          </p>
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoCapitalize="characters"
            className="mt-3 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button type="button" disabled={busy !== null || word.trim() !== CONFIRM_WORD} onClick={() => void apply()} className={`${btn} mt-3 w-full bg-primary text-primary-foreground`}>
            {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Terapkan
          </button>
          {progress && <p className="mt-2 text-sm text-navy">Memasang foto… {progress.done} / {progress.total}</p>}
          {report && (
            <div className="mt-3 rounded-lg bg-secondary p-3 text-sm">
              <p>Terpasang: <b>{report.ok}</b> produk ({report.photos} foto) · dilewati {report.skipped} · gagal {report.failed.length} · masuk antrean tinjau {report.queued}</p>
              {report.failed.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-destructive">
                  {report.failed.slice(0, 20).map((f) => (
                    <li key={f.sku}>{f.sku}: {f.alasan}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-navy">3. Perlu ditinjau ({pending} produk)</h2>
          <button type="button" onClick={() => void loadList()} className="min-h-11 px-2 text-xs font-bold text-primary">
            {loadingList ? "Memuat…" : "Muat ulang"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Pilih foto yang benar dengan satu klik, atau lewati produknya. Foto di bawah hanya pratinjau; yang dipilih diunduh ke toko.</p>
        <div className="mt-3 space-y-4">
          {cards.length === 0 && !loadingList && <p className="text-sm text-muted-foreground">Tidak ada yang menunggu.</p>}
          {cards.map((c) => (
            <article key={c.productId} className="rounded-xl border border-border p-3">
              <p className="text-sm font-extrabold text-navy">{c.name}</p>
              <p className="text-[11px] text-muted-foreground">{c.sku}</p>
              <div className="mt-3 space-y-3">
                {c.candidates.map((k) => (
                  <div key={k.id} className="rounded-lg bg-secondary p-3">
                    <div className="flex gap-2 overflow-x-auto">
                      {k.images.slice(0, 4).map((u) => (
                        <img key={u} src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-20 shrink-0 rounded-md bg-card object-contain" />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-navy">{k.shopeeName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      skor {k.score.toFixed(2)} · {k.images.length} foto{k.shared > 0 ? " · foto dipakai item lain" : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{k.reason}</p>
                    <button type="button" disabled={working !== null} onClick={() => void decide(c.productId, k.id)} className={`${btn} mt-2 w-full bg-primary text-primary-foreground`}>
                      {working === k.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Pakai foto ini
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" disabled={working !== null} onClick={() => void decide(c.productId, null)} className={`${btn} mt-3 w-full border border-border text-navy`}>
                Lewati produk ini
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className={`text-xl font-extrabold ${tone}`}>{value.toLocaleString("id-ID")}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
