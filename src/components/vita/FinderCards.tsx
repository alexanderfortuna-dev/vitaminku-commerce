import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatIDR } from "@/lib/format";
import type { FinderCard } from "@/lib/vitamin-finder-client";

/** Kartu produk ringkas dari hasil Vitamin Finder (data hanya dari fungsi). Tombol >= 44px. */
export function FinderCards({ products, onNavigate }: { products: FinderCard[]; onNavigate: () => void }) {
  if (!products.length) return null;
  return (
    <div className="mt-2 grid gap-2">
      {products.map((p) => (
        <div key={p.id} className="flex gap-3 rounded-2xl border border-border bg-card p-2">
          <Thumb p={p} />
          <div className="flex min-w-0 flex-1 flex-col">
            {p.brand && <p className="text-[11px] font-bold uppercase text-muted-foreground">{p.brand}</p>}
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-navy">{p.name}</p>
            {p.size && <p className="text-[11px] text-muted-foreground">{p.size}</p>}
            <p className="mt-0.5 text-sm font-extrabold text-navy">{formatIDR(p.price)}</p>
            <Link
              to="/produk/$handle"
              params={{ handle: p.slug }}
              onClick={onNavigate}
              className="mt-1 inline-flex min-h-11 items-center justify-center rounded-full border border-primary px-4 text-xs font-bold text-primary"
            >
              Lihat produk
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function Thumb({ p }: { p: FinderCard }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
      {p.image && !failed ? (
        <img src={p.image} alt={p.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" />
      ) : (
        <span className="px-1 text-center text-[10px] font-extrabold uppercase text-muted-foreground">VitaminKu</span>
      )}
    </div>
  );
}
