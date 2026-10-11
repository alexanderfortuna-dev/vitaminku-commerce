import { Loader2 } from "lucide-react";

/** Cursor-based "Muat lagi" control shared by the discovery pages. */
export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  count,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  count: number;
}) {
  if (count === 0) return null;
  return (
    <div className="px-4 pt-5 text-center">
      {hasNextPage ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-bold text-navy disabled:opacity-60"
        >
          {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
          {isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Semua produk sudah ditampilkan</p>
      )}
    </div>
  );
}
