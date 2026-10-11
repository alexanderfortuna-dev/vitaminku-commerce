import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { listAdminPromos, saveAdminPromo } from "@/lib/promo.functions";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/promo")({
  head: () => ({
    meta: [
      { title: "Promo — Seller Center | VitaminKu" },
      { name: "description", content: "Kelola kode promo VitaminKu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PromoPage,
});

const field = "mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary";
interface Draft { id?: string; code: string; label: string; value: string; brand: string; start: string; end: string; is_active: boolean }

// datetime-local values are entered and shown in WITA (+08:00).
const toLocal = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 16);
const toIso = (local: string) => `${local}:00+08:00`;

function PromoPage() {
  const role = (useAdminRole().data?.role ?? null) as null | "owner" | "admin" | "seller";
  const qc = useQueryClient();
  const fetchPromos = useServerFn(listAdminPromos);
  const runSave = useServerFn(saveAdminPromo);
  const q = useQuery({ queryKey: ["admin-promos"], queryFn: () => fetchPromos(), enabled: canEditCommerce(role) });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (q.data)
      setDrafts(q.data.map((p) => ({ id: p.id, code: p.code, label: p.label, value: String(p.value), brand: p.brand ?? "", start: toLocal(p.starts_at), end: toLocal(p.ends_at), is_active: p.is_active })));
  }, [q.data]);

  if (!canEditCommerce(role)) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk admin/owner.</p>;
  if (q.isPending) return <p className="p-4 text-sm text-muted-foreground">Memuat promo…</p>;
  if (q.isError) return <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>;

  const set = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  async function save(i: number) {
    const d = drafts[i]!;
    if (!d.start || !d.end) { toast.error("Isi tanggal mulai dan selesai"); return; }
    setBusy(i);
    try {
      await runSave({ data: { id: d.id, code: d.code, label: d.label, value: Number(d.value), brand: d.brand.trim() || null, starts_at: toIso(d.start), ends_at: toIso(d.end), is_active: d.is_active } });
      toast.success(`Promo ${d.code.toUpperCase()} disimpan`);
      void qc.invalidateQueries({ queryKey: ["admin-promos"] });
      void qc.invalidateQueries({ queryKey: ["running-promos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 px-4 py-4">
      <h1 className="text-base font-extrabold text-navy">Promo</h1>
      <p className="text-xs text-muted-foreground">Diskon persen, dipakai pembeli dengan kode di keranjang/checkout. Waktu dalam WITA. Merek kosong = semua produk.</p>
      {drafts.map((d, i) => (
        <div key={d.id ?? `new-${i}`} className="space-y-2 p-3 card-surface">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-navy">Kode<input className={`${field} uppercase`} value={d.code} onChange={(e) => set(i, { code: e.target.value })} /></label>
            <label className="text-xs font-semibold text-navy">Diskon %<input className={field} inputMode="decimal" value={d.value} onChange={(e) => set(i, { value: e.target.value.replace(/[^\d.]/g, "") })} /></label>
            <label className="col-span-2 text-xs font-semibold text-navy">Label<input className={field} value={d.label} onChange={(e) => set(i, { label: e.target.value })} /></label>
            <label className="col-span-2 text-xs font-semibold text-navy">Merek (opsional)<input className={field} value={d.brand} onChange={(e) => set(i, { brand: e.target.value })} placeholder="mis. Fitlife" /></label>
            <label className="text-xs font-semibold text-navy">Mulai<input type="datetime-local" className={field} value={d.start} onChange={(e) => set(i, { start: e.target.value })} /></label>
            <label className="text-xs font-semibold text-navy">Selesai<input type="datetime-local" className={field} value={d.end} onChange={(e) => set(i, { end: e.target.value })} /></label>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex min-h-11 flex-1 items-center gap-2 text-xs font-semibold text-navy">
              <input type="checkbox" className="h-5 w-5" checked={d.is_active} onChange={(e) => set(i, { is_active: e.target.checked })} /> Aktif
            </label>
            <button type="button" disabled={busy !== null} onClick={() => void save(i)} className="min-h-11 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">
              {busy === i ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setDrafts([...drafts, { code: "", label: "", value: "10", brand: "", start: "", end: "", is_active: true }])}
        className="flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-secondary text-xs font-bold text-navy">
        <Plus className="h-4 w-4" /> Tambah promo
      </button>
    </div>
  );
}
