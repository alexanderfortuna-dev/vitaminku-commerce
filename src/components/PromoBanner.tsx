import { useEffect, useState } from "react";
import { Tag, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRunningPromos } from "@/hooks/useRunningPromos";
import { dismissPromo, pickBannerPromo, promoBannerText, writePendingPromo, type Promo } from "@/lib/promo";

/**
 * Spanduk promo tanpa spam: satu promo berjalan, bisa ditutup (diingat 24 jam per kode di perangkat),
 * tombol "Pakai" menyimpan kode untuk dipakai otomatis di keranjang/checkout. Tidak tampil di admin & checkout.
 */
export function PromoBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const promos = useRunningPromos();
  const [promo, setPromo] = useState<Promo | null>(null);
  useEffect(() => setPromo(pickBannerPromo(promos)), [promos]);

  if (!promo || pathname.startsWith("/admin") || pathname.startsWith("/checkout") || pathname.startsWith("/pesanan")) return null;
  return (
    <div role="status" className="border-b border-border bg-primary-soft px-4 py-2 text-accent-foreground">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <Tag className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">{promoBannerText(promo)}</p>
        <button
          type="button"
          onClick={() => {
            writePendingPromo(promo.code);
            toast.success(`Kode ${promo.code} siap dipakai di keranjang.`);
          }}
          className="min-h-11 shrink-0 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground"
        >
          Pakai
        </button>
        <button
          type="button"
          aria-label="Tutup promo"
          onClick={() => {
            dismissPromo(promo.code);
            setPromo(pickBannerPromo(promos));
          }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
