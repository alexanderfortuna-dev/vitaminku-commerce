import { Link } from "@tanstack/react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import type { ReadinessResult } from "@/lib/product-readiness";

/**
 * Daftar centang "Siap Tayang": hijau = terpenuhi, merah = kurang + tautan satu ketuk ke layar perbaikan.
 * Hanya tampilan; penegak akhir aturan tayang tetap trigger products_guard di database.
 */
export function ReadinessChecklist({ productId, result }: { productId: string; result: ReadinessResult }) {
  return (
    <ul className="space-y-2" aria-label="Syarat siap tayang">
      {result.items.map((item) => (
        <li
          key={item.key}
          className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 ${
            item.ok ? "border-emerald-600/30 bg-emerald-600/10" : "border-destructive/40 bg-destructive/10"
          }`}
        >
          {item.ok ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
          )}
          <span className={`min-w-0 flex-1 text-sm font-semibold ${item.ok ? "text-navy" : "text-destructive"}`}>
            <span className="sr-only">{item.ok ? "Terpenuhi: " : "Kurang: "}</span>
            {item.ok ? item.label : item.problem}
          </span>
          {!item.ok && item.fix === "product" && (
            <Link
              to="/admin/produk/$id"
              params={{ id: encodeURIComponent(productId) }}
              className="grid min-h-11 shrink-0 place-items-center rounded-full bg-card px-4 text-xs font-bold text-navy"
            >
              Perbaiki
            </Link>
          )}
          {!item.ok && item.fix === null && (
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Hubungi owner</span>
          )}
        </li>
      ))}
    </ul>
  );
}
