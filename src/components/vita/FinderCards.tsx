import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { formatIDR } from "@/lib/format";
import { getProductBySlug } from "@/lib/catalog.functions";
import { useCartStore } from "@/stores/cartStore";
import type { FinderCard } from "@/lib/vitamin-finder-client";

const FORM_LABEL: Record<string, string> = { bubuk: "Bubuk", kapsul: "Kapsul", tablet: "Tablet", gummy: "Gummy", cair: "Cair" };

/**
 * Kartu produk hasil Vita (data hanya dari server). Tombol ≥ 44px; ukuran gambar tetap (tanpa geser tata letak).
 * "Tambah ke keranjang" mengambil data produk segar dari katalog lalu memakai keranjang yang sudah ada.
 */
export function FinderCards({
  products,
  onNavigate,
  onChosen,
}: {
  products: FinderCard[];
  onNavigate: () => void;
  onChosen?: (productId: string) => void;
}) {
  const [compare, setCompare] = useState<string[]>([]);
  if (!products.length) return null;
  const toggle = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-3)));
  const chosen = products.filter((p) => compare.includes(p.id));
  return (
    <div className="mt-2 grid gap-2">
      {products.map((p) => (
        <div key={p.id} className="rounded-2xl border border-border bg-card p-2">
          <div className="flex gap-3">
            <Thumb p={p} />
            <div className="flex min-w-0 flex-1 flex-col">
              {p.brand && <p className="text-[11px] font-bold uppercase text-muted-foreground">{p.brand}</p>}
              <p className="line-clamp-2 text-sm font-semibold leading-tight text-navy">{p.name}</p>
              {p.size && <p className="text-[11px] text-muted-foreground">{p.size}</p>}
              <p className="mt-0.5 text-sm font-extrabold text-navy">
                {formatIDR(p.price)}
                {p.costPerServing ? <span className="ml-1 text-[11px] font-semibold text-muted-foreground">± {formatIDR(p.costPerServing)}/sajian</span> : null}
              </p>
            </div>
          </div>
          {p.reason && <p className="mt-2 text-xs text-foreground">{p.reason}</p>}
          {(p.goodFor || p.notFor) && (
            <dl className="mt-1 grid gap-0.5 text-[11px] leading-snug">
              {p.goodFor && (
                <div>
                  <dt className="inline font-bold text-navy">Cocok untuk: </dt>
                  <dd className="inline text-muted-foreground">{p.goodFor}</dd>
                </div>
              )}
              {p.notFor && (
                <div>
                  <dt className="inline font-bold text-navy">Kurang cocok jika: </dt>
                  <dd className="inline text-muted-foreground">{p.notFor}</dd>
                </div>
              )}
            </dl>
          )}
          {(p.dose || p.evidence) && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {p.dose ? `Takaran di label: ${p.dose}. ` : "Takaran: ikuti petunjuk di label. "}
              {p.evidence ? `Umumnya untuk dewasa: ${p.evidence.range} (${p.evidence.source}).` : ""}
            </p>
          )}
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <AddButton p={p} onAdded={() => onChosen?.(p.id)} />
            <button
              type="button"
              aria-pressed={compare.includes(p.id)}
              onClick={() => toggle(p.id)}
              className={`min-h-11 rounded-full border px-3 text-xs font-bold ${compare.includes(p.id) ? "border-navy bg-navy text-navy-foreground" : "border-border text-navy"}`}
            >
              {compare.includes(p.id) ? "✓ Bandingkan" : "Bandingkan"}
            </button>
          </div>
          <Link
            to="/produk/$handle"
            params={{ handle: p.slug }}
            onClick={() => {
              onChosen?.(p.id);
              onNavigate();
            }}
            className="mt-1 inline-flex min-h-11 w-full items-center justify-center text-xs font-bold text-primary underline"
          >
            Lihat detail produk
          </Link>
        </div>
      ))}
      {chosen.length >= 2 && <CompareTable items={chosen} />}
      {compare.length === 1 && <p className="text-[11px] text-muted-foreground">Pilih 1–2 produk lagi untuk dibandingkan.</p>}
    </div>
  );
}

function AddButton({ p, onAdded }: { p: FinderCard; onAdded: () => void }) {
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const fresh = await getProductBySlug({ data: { slug: p.slug } });
      if (!fresh) throw new Error("Produk sudah tidak tersedia.");
      useCartStore.getState().addItem(fresh, 1);
      toast.success("Ditambahkan ke keranjang", { description: fresh.name });
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambahkan ke keranjang");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void add()}
      className="min-h-11 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-60"
    >
      {busy ? "Menambahkan…" : "Tambah ke keranjang"}
    </button>
  );
}

function CompareTable({ items }: { items: FinderCard[] }) {
  const rows: Array<[string, (p: FinderCard) => string]> = [
    ["Merek", (p) => p.brand || "—"],
    ["Harga", (p) => formatIDR(p.price)],
    ["Ukuran", (p) => p.size ?? "—"],
    ["Sajian", (p) => (p.servings ? `${p.servings}` : "—")],
    ["Per sajian", (p) => (p.costPerServing ? formatIDR(p.costPerServing) : "—")],
    ["Bentuk", (p) => (p.form ? (FORM_LABEL[p.form] ?? p.form) : "—")],
    ["Takaran label", (p) => p.dose ?? "ikuti label"],
  ];
  return (
    <div className="rounded-2xl border border-navy/30 bg-card p-2" aria-label="Perbandingan produk">
      <p className="mb-1 text-xs font-extrabold text-navy">Perbandingan</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] table-fixed text-[11px]">
          <thead>
            <tr>
              <th className="w-20 text-left font-bold text-muted-foreground" />
              {items.map((p) => (
                <th key={p.id} className="px-1 text-left font-bold text-navy">
                  <span className="line-clamp-2">{p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-t border-border">
                <td className="py-1 font-bold text-muted-foreground">{label}</td>
                {items.map((p) => (
                  <td key={p.id} className="break-words px-1 py-1 text-navy">
                    {f(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Thumb({ p }: { p: FinderCard }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
      {p.image && !failed ? (
        <img src={p.image} alt={p.name} width={80} height={80} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" />
      ) : (
        <span className="px-1 text-center text-[10px] font-extrabold uppercase text-muted-foreground">{p.brand || "VitaminKu"}</span>
      )}
    </div>
  );
}
