import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBranch, getAdminStore, saveBranch, saveSettings, type Branch } from "@/lib/store.functions";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";
import { parseMapsUrl, validLatLng } from "@/lib/geo";

export const Route = createFileRoute("/admin/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan Toko — Seller Center | VitaminKu" },
      { name: "description", content: "Atur cabang, nomor WhatsApp, dan teks toko VitaminKu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PengaturanPage,
});

const field = "mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary";
type Draft = Omit<Branch, "id"> & { id?: string };

function PengaturanPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const qc = useQueryClient();
  const fetchStore = useServerFn(getAdminStore);
  const runSaveBranch = useServerFn(saveBranch);
  const runDelete = useServerFn(deleteBranch);
  const runSaveSettings = useServerFn(saveSettings);
  const store = useQuery({ queryKey: ["admin-store"], queryFn: () => fetchStore(), enabled: canEditCommerce(role) });
  const [settings, setSettings] = useState({ store_name: "", logo_url: "", hero_title: "", hero_subtitle: "", free_shipping_note: "", operating_hours: "" });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!store.data) return;
    const s = store.data.settings;
    if (s) setSettings({ ...s, logo_url: s.logo_url ?? "" });
    setDrafts(store.data.branches);
  }, [store.data]);

  if (!canEditCommerce(role)) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk admin/owner.</p>;
  if (store.isPending) return <p className="p-4 text-sm text-muted-foreground">Memuat pengaturan…</p>;
  if (store.isError) return <p className="p-4 text-sm text-destructive">{(store.error as Error).message}</p>;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-store"] });
    void qc.invalidateQueries({ queryKey: ["public-store"] });
  };

  async function onSaveBranch(i: number) {
    const d = drafts[i]!;
    setBusy(`b${i}`);
    try {
      const hasLat = d.lat != null && Number.isFinite(d.lat);
      const hasLng = d.lng != null && Number.isFinite(d.lng);
      if (hasLat !== hasLng || (hasLat && !validLatLng(d.lat!, d.lng!))) throw new Error("Lat harus -90..90 dan lng -180..180 (isi keduanya).");
      await runSaveBranch({ data: { ...d, lat: hasLat ? d.lat : null, lng: hasLng ? d.lng : null, maps_url: d.maps_url || null, display_order: Number(d.display_order) || 0 } });
      toast.success(`Cabang ${d.name} disimpan`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(null);
    }
  }
  async function onDelete(i: number) {
    const d = drafts[i]!;
    if (!d.id) return setDrafts(drafts.filter((_, k) => k !== i));
    if (!confirm(`Hapus cabang ${d.name}? Pesanan lama tetap menyimpan nama cabangnya.`)) return;
    setBusy(`b${i}`);
    try {
      await runDelete({ data: { id: d.id } });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setBusy(null);
    }
  }
  async function onSaveSettings() {
    setBusy("s");
    try {
      await runSaveSettings({ data: settings });
      toast.success("Pengaturan toko disimpan");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(null);
    }
  }
  const set = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, k) => (k === i ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-base font-extrabold text-navy">Pengaturan Toko</h1>

      <section className="space-y-3 p-3 card-surface">
        <div>
          <h2 className="text-sm font-bold text-navy">Cabang & nomor WhatsApp</h2>
          <p className="mt-1 text-xs text-muted-foreground">Pembeli memilih cabang saat checkout; pesanan dikirim ke WhatsApp cabang itu. Hanya cabang aktif yang tampil.</p>
        </div>
        {drafts.map((d, i) => (
          <div key={d.id ?? `new-${i}`} className="space-y-2 rounded-xl border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-navy">Nama<input className={field} value={d.name} onChange={(e) => set(i, { name: e.target.value })} /></label>
              <label className="text-xs font-semibold text-navy">Area<input className={field} value={d.area} onChange={(e) => set(i, { area: e.target.value })} placeholder="mis. Denpasar" /></label>
              <label className="text-xs font-semibold text-navy">WhatsApp<input className={field} inputMode="tel" value={d.whatsapp} onChange={(e) => set(i, { whatsapp: e.target.value })} placeholder="0813…" /></label>
              <label className="col-span-2 text-xs font-semibold text-navy">Link Google Maps (opsional)<input className={field} value={d.maps_url ?? ""} onChange={(e) => { const v = e.target.value; const p = parseMapsUrl(v); set(i, p ? { maps_url: v, lat: p.lat, lng: p.lng } : { maps_url: v }); }} placeholder="https://maps.google.com/…@-8.65,115.21" /></label>
              <label className="text-xs font-semibold text-navy">Lat<input className={field} inputMode="decimal" value={d.lat ?? ""} onChange={(e) => set(i, { lat: e.target.value === "" ? null : Number(e.target.value) })} placeholder="-8.65" /></label>
              <label className="text-xs font-semibold text-navy">Lng<input className={field} inputMode="decimal" value={d.lng ?? ""} onChange={(e) => set(i, { lng: e.target.value === "" ? null : Number(e.target.value) })} placeholder="115.21" /></label>
              <label className="text-xs font-semibold text-navy">Kode cabang<input className={field} value={d.code ?? ""} onChange={(e) => set(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} maxLength={24} placeholder="mis. SANUR" /></label>
              <label className="col-span-2 text-xs font-semibold text-navy">Alamat lengkap (opsional)<input className={field} value={d.address ?? ""} onChange={(e) => set(i, { address: e.target.value })} /></label>
              <label className="col-span-2 text-xs font-semibold text-navy">Jam buka (opsional)<input className={field} value={d.opening_hours ?? ""} onChange={(e) => set(i, { opening_hours: e.target.value })} placeholder="mis. Setiap hari 09.00-21.00" /></label>
              <label className="text-xs font-semibold text-navy">Urutan<input className={field} inputMode="numeric" value={d.display_order} onChange={(e) => set(i, { display_order: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex min-h-11 flex-1 items-center gap-2 text-xs font-semibold text-navy">
                <input type="checkbox" className="h-5 w-5" checked={d.is_active} onChange={(e) => set(i, { is_active: e.target.checked })} /> Aktif
              </label>
              <button type="button" aria-label="Hapus cabang" disabled={!!busy} onClick={() => void onDelete(i)} className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-destructive disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
              </button>
              <button type="button" disabled={!!busy} onClick={() => void onSaveBranch(i)} className="min-h-11 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">
                {busy === `b${i}` ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setDrafts([...drafts, { name: "", area: "", whatsapp: "", is_active: true, display_order: drafts.length, lat: null, lng: null, maps_url: null, code: null, address: null, opening_hours: null }])}
          className="flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-secondary text-xs font-bold text-navy">
          <Plus className="h-4 w-4" /> Tambah cabang
        </button>
      </section>

      <section className="space-y-2 p-3 card-surface">
        <h2 className="text-sm font-bold text-navy">Umum</h2>
        {(
          [
            ["store_name", "Nama toko"],
            ["logo_url", "Link logo (https://…, opsional)"],
            ["hero_title", "Judul banner beranda"],
            ["hero_subtitle", "Teks banner beranda"],
            ["free_shipping_note", "Catatan gratis ongkir (opsional)"],
            ["operating_hours", "Jam operasional"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="block text-xs font-semibold text-navy">
            {label}
            <input className={field} value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
          </label>
        ))}
        <button type="button" disabled={!!busy} onClick={() => void onSaveSettings()} className="min-h-11 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50">
          {busy === "s" ? "Menyimpan…" : "Simpan Pengaturan"}
        </button>
      </section>
    </div>
  );
}
