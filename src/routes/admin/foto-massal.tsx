import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { FileArchive } from "lucide-react";
import { toast } from "sonner";
import { addProductPhoto, lookupSkus } from "@/lib/seller.functions";
import { MAX_PHOTOS, skuFromPhotoName } from "@/lib/seller-import";
import { compressImage } from "@/lib/image-compress";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/foto-massal")({
  head: () => ({
    meta: [
      { title: "Upload Foto Massal — Seller Center | VitaminKu" },
      { name: "description", content: "Unggah ZIP berisi foto bernama SKU untuk dipasang otomatis ke produk." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FotoMassalPage,
});

type Line = { file: string; sku: string; status: "ok" | "fail" | "skip"; reason?: string };

function FotoMassalPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const lookup = useServerFn(lookupSkus);
  const add = useServerFn(addProductPhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  if (!canEditCommerce(role)) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk admin/owner.</p>;

  async function run(zipFile: File) {
    setBusy(true);
    setLines([]);
    const out: Line[] = [];
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.includes("__MACOSX"));
      const parsed = entries.map((f) => ({ entry: f, info: skuFromPhotoName(f.name) }));
      // A SKU may itself end in "_2": prefer the full file stem when it is a real SKU.
      const stems = parsed.map((p) => (p.entry.name.split("/").pop() ?? "").replace(/\.[^.]+$/, ""));
      const candidates = [...new Set([...parsed.map((p) => p.info?.sku).filter(Boolean), ...stems])] as string[];
      const { products } = await lookup({ data: { skus: candidates } });
      const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), { ...p }]));
      const jobs = parsed
        .map((p, i) => {
          const stem = stems[i]!;
          const exact = bySku.get(stem.toLowerCase());
          const sku = exact ? stem : p.info?.sku;
          return { entry: p.entry, sku, order: exact ? 1 : (p.info?.order ?? 1) };
        })
        .sort((a, b) => (a.sku ?? "").localeCompare(b.sku ?? "") || a.order - b.order);
      setProgress({ done: 0, total: jobs.length });
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i]!;
        const name = j.entry.name;
        const product = j.sku ? bySku.get(j.sku.toLowerCase()) : undefined;
        if (!j.sku) out.push({ file: name, sku: "", status: "skip", reason: "bukan file foto (.jpg/.png/.webp)" });
        else if (!product) out.push({ file: name, sku: j.sku, status: "fail", reason: "SKU tidak ditemukan" });
        else if (product.photos >= MAX_PHOTOS) out.push({ file: name, sku: j.sku, status: "fail", reason: `sudah ${MAX_PHOTOS} foto` });
        else {
          try {
            const blob = await j.entry.async("blob");
            await add({ data: { id: product.id, file: await compressImage(Object.assign(blob, { name })) } });
            product.photos++;
            out.push({ file: name, sku: j.sku, status: "ok" });
          } catch (e) {
            out.push({ file: name, sku: j.sku, status: "fail", reason: e instanceof Error ? e.message : "gagal" });
          }
        }
        setProgress({ done: i + 1, total: jobs.length });
        if (i % 10 === 0) setLines([...out]);
      }
      setLines(out);
      toast.success(`${out.filter((l) => l.status === "ok").length} foto dipasang`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ZIP tidak bisa dibaca");
    } finally {
      setBusy(false);
    }
  }

  const ok = lines.filter((l) => l.status === "ok").length;
  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-base font-extrabold text-navy">Upload Foto Massal</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          ZIP berisi foto bernama SKU: <b>SKU.jpg</b> = foto utama, <b>SKU_2.jpg</b> … <b>SKU_9.jpg</b> = foto berikutnya.
          Foto dikompres (WebP, maks 1200px) sebelum diunggah. Foto ditambahkan setelah foto yang sudah ada.
        </p>
      </div>
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
        <FileArchive className="h-4 w-4" /> {busy ? "Memproses…" : "Pilih file ZIP"}
      </button>
      <input ref={inputRef} type="file" accept=".zip,application/zip" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void run(f);
        }} />
      {progress && (
        <div aria-live="polite">
          <p className="text-xs text-navy">{progress.done}/{progress.total} file · {ok} berhasil</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
        </div>
      )}
      {lines.some((l) => l.status !== "ok") && (
        <ul className="max-h-80 space-y-1 overflow-y-auto text-xs">
          {lines.filter((l) => l.status !== "ok").map((l) => (
            <li key={l.file} className="rounded-lg bg-destructive/10 px-2 py-1 text-destructive">
              {l.file}: {l.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
