import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listActivity } from "@/lib/seller.functions";
import { formatRp } from "@/lib/sheet-io";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/aktivitas")({
  head: () => ({
    meta: [
      { title: "Log Aktivitas — Seller Center | VitaminKu" },
      { name: "description", content: "Siapa mengubah harga, stok, atau status produk, dan kapan." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ActivityPage,
});

const LABEL: Record<string, string> = { harga: "Harga", harga_coret: "Harga coret", stok: "Stok", live: "Status" };

function fmt(key: string, v: unknown) {
  if (key === "live") return v ? "Live" : "Draf";
  if (key.startsWith("harga")) return v == null ? "kosong" : formatRp(Number(v));
  return String(v ?? "—");
}

function ActivityPage() {
  const roleQuery = useAdminRole();
  const isOwner = roleQuery.data?.role === "owner";
  const [onlyProducts, setOnlyProducts] = useState(true);
  const fetchLog = useServerFn(listActivity);
  const log = useInfiniteQuery({
    queryKey: ["activity", onlyProducts],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchLog({ data: { offset: pageParam, onlyProducts } }),
    getNextPageParam: (p) => p.nextOffset ?? undefined,
    enabled: isOwner,
  });

  if (!isOwner) return <p className="p-4 text-sm text-muted-foreground">Log aktivitas hanya untuk owner.</p>;
  const entries = log.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div className="px-4 py-4">
      <h1 className="text-base font-extrabold text-navy">Log Aktivitas</h1>
      <label className="mt-2 flex items-center gap-2 text-xs text-navy">
        <input type="checkbox" checked={!onlyProducts} onChange={(e) => setOnlyProducts(!e.target.checked)} className="h-4 w-4" />
        Tampilkan juga aktivitas admin lain (impor, blokir, pesanan)
      </label>
      {log.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Memuat…</p>
      ) : log.isError ? (
        <p className="mt-4 text-sm text-muted-foreground">{log.error instanceof Error ? log.error.message : "Gagal memuat"}</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Belum ada aktivitas.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((e) => {
            const p = JSON.parse(e.payloadJson) as Record<string, unknown>;
            const changes = Object.keys(LABEL).filter((k) => Array.isArray(p[k]));
            return (
              <li key={e.id} className="p-3 text-xs card-surface">
                <p className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} · {e.who}
                </p>
                {e.action === "product_change" ? (
                  <>
                    <p className="mt-1 font-semibold text-navy">{String(p["name"] ?? "")} <span className="text-muted-foreground">({String(p["sku"] ?? "")})</span></p>
                    {changes.map((k) => {
                      const [a, b] = p[k] as [unknown, unknown];
                      return <p key={k} className="text-navy">{LABEL[k]}: {fmt(k, a)} → <b>{fmt(k, b)}</b></p>;
                    })}
                  </>
                ) : (
                  <p className="mt-1 font-semibold text-navy">{e.action}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {log.hasNextPage && (
        <button type="button" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}
          className="mt-4 w-full rounded-full bg-secondary px-4 py-3 text-sm font-bold text-navy">
          {log.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
    </div>
  );
}
