import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, QrCode } from "lucide-react";
import { toast } from "sonner";
import { getLinksData, type BranchAdminRow, type BranchLite } from "@/lib/branch-admins.functions";
import { adminLink, branchLink, combinedLink, qrFileName } from "@/lib/links";
import { hasPermission } from "@/lib/permissions";
import { downloadBlob } from "@/lib/sheet-io";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/tautan")({
  head: () => ({
    meta: [
      { title: "Tautan & Kode QR — Seller Center | VitaminKu" },
      { name: "description", content: "Salin tautan dan unduh QR untuk tiap cabang dan admin." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TautanPage,
});

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback untuk browser/konteks tanpa Clipboard API
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

async function downloadQr(text: string, fileName: string) {
  const QR = (await import("qrcode")).default; // hanya di browser
  const dataUrl = await QR.toDataURL(text, { width: 640, margin: 2, errorCorrectionLevel: "M" });
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]!), (c) => c.charCodeAt(0));
  downloadBlob(fileName, new Blob([bytes], { type: "image/png" }));
}

function TautanPage() {
  const role = (useAdminRole().data?.role ?? null) as null | "owner" | "admin" | "seller";
  const allowed = hasPermission({ role }, "links_manage");
  const fetchData = useServerFn(getLinksData);
  const q = useQuery({ queryKey: ["links-data"], queryFn: () => fetchData(), enabled: allowed, retry: false });
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  if (!allowed) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk Owner dan Manajer.</p>;

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Link to="/admin" aria-label="Kembali" className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-navy">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-extrabold text-navy">Tautan & Kode QR</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Tautan cabang membuka toko dengan cabang itu terpilih. Tautan admin menambah kode referral admin. Alamat toko yang dipakai: <b>{origin || "…"}</b>
      </p>
      {q.isPending && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && origin && q.data.branches.length === 0 && <p className="text-sm text-muted-foreground">Belum ada cabang.</p>}
      {q.data && origin &&
        [...q.data.branches].sort((a, b) => Number(b.is_active) - Number(a.is_active)).map((b) => (
          <BranchCard key={b.id} origin={origin} branch={b} admins={q.data.admins.filter((a) => a.branch_id === b.id)} />
        ))}
    </div>
  );
}

function LinkRow({ label, url, qrName }: { label: string; url: string; qrName: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 rounded-xl border border-border p-2">
      <p className="text-xs font-semibold text-navy">{label}</p>
      <p className="break-all rounded-lg bg-secondary px-2 py-1.5 text-xs text-muted-foreground">{url}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={async () => (await copyText(url)) ? toast.success("Tautan disalin") : toast.error("Tidak bisa menyalin. Tekan lama pada tautan lalu salin.")}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary text-xs font-bold text-primary-foreground">
          <Copy className="h-4 w-4" /> Salin tautan
        </button>
        <button type="button" disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadQr(url, qrName);
            } catch {
              toast.error("QR gagal dibuat");
            } finally {
              setBusy(false);
            }
          }}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-secondary text-xs font-bold text-navy disabled:opacity-50">
          <QrCode className="h-4 w-4" /> {busy ? "Membuat…" : "Unduh QR"}
        </button>
      </div>
    </div>
  );
}

function BranchCard({ origin, branch, admins }: { origin: string; branch: BranchLite; admins: BranchAdminRow[] }) {
  const link = branchLink(origin, branch.code);
  return (
    <section className={`space-y-2 rounded-2xl border border-border bg-card p-3 ${branch.is_active ? "" : "opacity-70"}`}>
      <p className="text-sm font-bold text-navy">
        {branch.name}
        {!branch.is_active && <span className="ml-2 text-xs font-semibold text-muted-foreground">(nonaktif)</span>}
      </p>
      {link ? (
        <LinkRow label="Tautan cabang" url={link} qrName={qrFileName("cabang", branch.code!)} />
      ) : (
        <Link to="/admin/pengaturan" className="flex min-h-11 items-center rounded-xl bg-amber-50 px-3 text-xs font-bold text-amber-800 underline">
          Isi kode cabang dulu
        </Link>
      )}
      {admins.map((a) => {
        const url = combinedLink(origin, branch.code, a.referral_code) ?? adminLink(origin, a.referral_code);
        if (!url) return null;
        return (
          <LinkRow key={a.id} label={`${a.name} (${a.role === "utama" ? "Utama" : "Cadangan"})`} url={url}
            qrName={qrFileName(link ? "gabungan" : "ref", a.referral_code!)} />
        );
      })}
    </section>
  );
}
