import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ImageOff, Star } from "lucide-react";
import { listWorkQueue } from "@/lib/work-queue.functions";
import {
  QUEUE_FILTERS,
  QUEUE_FILTER_LABEL,
  QUEUE_ISSUE_LABEL,
  type QueueFilter,
  type QueueRow,
} from "@/lib/work-queue";
import { hasPermission } from "@/lib/permissions";
import { formatRp } from "@/lib/sheet-io";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/antrian")({
  head: () => ({
    meta: [
      { title: "Antrian Kerja — Seller Center | VitaminKu" },
      { name: "description", content: "Produk aktif yang masih kurang foto, harga, atau berat. Produk unggulan lebih dulu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WorkQueuePage,
});

function WorkQueuePage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  if (roleQuery.isPending) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  if (!hasPermission({ role }, "products_edit")) {
    return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk tim produk, admin, dan owner.</p>;
  }
  return <Queue />;
}

function Queue() {
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const fetchQueue = useServerFn(listWorkQueue);
  const q = useInfiniteQuery({
    queryKey: ["work-queue", filter],
    queryFn: ({ pageParam }) => fetchQueue({ data: { filter, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    retry: false,
  });

  const counts = q.data?.pages[0]?.counts;
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div className="px-4 py-4">
      <h1 className="text-base font-extrabold text-navy">Antrian Kerja</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Produk yang sedang tayang tetapi masih kurang data. Produk unggulan di atas.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Filter antrian">
        {QUEUE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-left ${
              filter === f ? "border-primary bg-primary/10" : "border-border bg-card"
            }`}
          >
            <span className="block text-lg font-extrabold leading-tight text-navy">
              {counts ? counts[f].toLocaleString("id-ID") : "…"}
            </span>
            <span className="block text-xs font-semibold text-muted-foreground">{QUEUE_FILTER_LABEL[f]}</span>
          </button>
        ))}
      </div>

      {q.isError ? (
        <div className="mt-6">
          <p className="text-sm text-muted-foreground">
            {q.error instanceof Error ? q.error.message : "Antrian tidak dapat dimuat."}
          </p>
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="mt-3 min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            Coba lagi
          </button>
        </div>
      ) : q.isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">Memuat antrian…</p>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-navy">Antrian kosong.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Semua produk tayang sudah punya foto, harga, dan berat.
          </p>
          <Link
            to="/admin/produk-cepat"
            className="mt-3 inline-grid min-h-11 place-items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            Tambah produk cepat
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {rows.map((row) => (
              <QueueItem key={row.id} row={row} />
            ))}
          </ul>
          <div className="mt-4 flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Menampilkan {rows.length.toLocaleString("id-ID")} dari{" "}
              {(q.data?.pages[0]?.total ?? rows.length).toLocaleString("id-ID")}
            </span>
            {q.hasNextPage && (
              <button
                type="button"
                disabled={q.isFetchingNextPage}
                onClick={() => void q.fetchNextPage()}
                className="min-h-11 rounded-full bg-secondary px-6 text-sm font-bold text-navy disabled:opacity-60"
              >
                {q.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function QueueItem({ row }: { row: QueueRow }) {
  const missingPrice = row.issues.includes("no_price");
  return (
    <li className="flex gap-3 p-3 card-surface">
      {row.image_url ? (
        <img src={row.image_url} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
          <ImageOff className="h-5 w-5" aria-label="Tanpa foto" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-semibold text-navy">
          {row.is_hero && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              <Star className="h-3 w-3" aria-hidden /> Unggulan
            </span>
          )}
          <span className="truncate">{row.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {row.sku} · {row.brand || "Tanpa merek"}
        </p>
        <p className="mt-0.5 text-xs text-navy">
          <span className="font-bold">{missingPrice ? "Harga belum diisi" : formatRp(row.price)}</span> · stok {row.stock}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {row.issues.map((i) => (
            <span key={i} className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
              {QUEUE_ISSUE_LABEL[i]}
            </span>
          ))}
          {!row.purchasable && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              Belum bisa dibeli
            </span>
          )}
        </div>
      </div>
      <Link
        to="/admin/produk/$id"
        params={{ id: encodeURIComponent(row.id) }}
        className="grid min-h-11 shrink-0 place-items-center self-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground"
      >
        Perbaiki
      </Link>
    </li>
  );
}
