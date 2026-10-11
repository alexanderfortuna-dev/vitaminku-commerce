import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { catalogStatusQueryOptions } from "@/lib/catalog-db";

export function StoreStatusBanner() {
  const { isError, error, refetch, isFetching } = useQuery(catalogStatusQueryOptions());

  if (!isError) return null;

  const showTechnical =
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1");

  const message = error instanceof Error ? error.message : String(error);

  return (
    <div role="status" className="border-b border-destructive/30 bg-destructive/10 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">
            Produk sedang tidak dapat dimuat. Coba lagi beberapa saat.
          </p>
          {showTechnical && (
            <p className="mt-1 break-words text-[11px] text-muted-foreground">{message}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Coba lagi
        </button>
      </div>
    </div>
  );
}
