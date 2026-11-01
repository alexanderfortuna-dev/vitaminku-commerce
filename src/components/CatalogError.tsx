export function CatalogError({
  onRetry,
  isFetching,
}: {
  onRetry: () => void;
  isFetching: boolean;
}) {
  return (
    <div role="alert" className="px-4 py-6 text-center">
      <p className="text-sm font-semibold">Katalog sedang tidak dapat dimuat.</p>
      <p className="mt-1 text-sm text-muted-foreground">Periksa koneksi lalu coba lagi.</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isFetching}
        className="mt-3 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {isFetching ? "Memuat…" : "Coba lagi"}
      </button>
    </div>
  );
}
