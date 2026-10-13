import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatIDR } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { advanceOrderStage, listOrderBoard, type BoardOrder } from "@/lib/order-board.functions";
import {
  ADVANCE_LABEL,
  ORDER_STAGES,
  STAGE_LABEL,
  ageMinutes,
  buildStageMessage,
  buildWhatsappLink,
  effectiveStage,
  formatAge,
  friendlyStageError,
  isLateNewOrder,
  isLegacyBackfilled,
  isTerminalStage,
  nextStage,
  NEW_ORDER_LATE_MINUTES,
  type OrderStage,
  type WaStage,
} from "@/lib/order-stage";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/pesanan-masuk")({
  head: () => ({
    meta: [
      { title: "Pesanan Masuk — Panel Admin | VitaminKu" },
      { name: "description", content: "Papan pesanan masuk per tahap untuk admin cabang." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: IncomingOrdersPage,
});

const REFRESH_MS = 30_000;

function IncomingOrdersPage() {
  const role = (useAdminRole().data?.role ?? null) as null | "owner" | "admin" | "seller";
  const allowed = hasPermission({ role }, "orders_manage");
  const fetchBoard = useServerFn(listOrderBoard);
  const advance = useServerFn(advanceOrderStage);
  const qc = useQueryClient();
  const [tab, setTab] = useState<OrderStage>("baru");
  const [branchId, setBranchId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const q = useQuery({
    queryKey: ["order-board", branchId],
    queryFn: () => fetchBoard({ data: { branchId: branchId || null } }),
    enabled: allowed,
    retry: false,
    // Segarkan ringan tiap 30 detik; react-query menjeda otomatis saat tab browser tidak terlihat.
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Umur pesanan dihitung di klien dari created_at; perbarui tiap 30 dtk hanya saat tab terlihat.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  useEffect(() => {
    if (q.dataUpdatedAt) setNow(Date.now());
  }, [q.dataUpdatedAt]);

  const board = q.data;
  const lateCount = useMemo(
    () => (board?.columns.baru ?? []).filter((o) => isLateNewOrder(o, now)).length,
    [board, now],
  );

  if (!allowed) {
    return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk admin/owner.</p>;
  }

  function openWhatsapp(o: BoardOrder, stage: WaStage) {
    let resi: string | null = null;
    if (stage === "dikirim") {
      // Opsional: kosongkan atau tekan Batal untuk melewati no. resi.
      resi = window.prompt("No. resi (boleh dikosongkan, lalu tekan OK):", "")?.trim() || null;
    }
    const text = buildStageMessage(stage, {
      customerName: o.customer_name,
      orderNumber: o.order_number,
      branchName: o.branch_name,
      courierLabel: o.courier_label,
      resi,
    });
    const link = buildWhatsappLink(o.whatsapp, text);
    if (!link) {
      toast.error("Nomor WhatsApp pelanggan tidak valid.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }

  async function move(o: BoardOrder, to: Exclude<OrderStage, "baru">) {
    if (to === "batal") {
      if (!window.confirm(`Batalkan pesanan ${o.order_number}? Stok yang sudah dikurangi akan dikembalikan.`)) return;
    } else if (to === "dikonfirmasi" && o.status === "pending") {
      if (!window.confirm(`${o.order_number} belum dibayar pelanggan. Tetap konfirmasi? Stok akan dikurangi.`)) return;
    }
    setBusy(o.id);
    try {
      await advance({ data: { orderId: o.id, stage: to } });
      toast.success(`${o.order_number}: ${STAGE_LABEL[to]}`, {
        duration: 15_000,
        action: { label: "Kirim WhatsApp", onClick: () => openWhatsapp(o, to) },
      });
      await qc.invalidateQueries({ queryKey: ["order-board"] });
    } catch (e) {
      toast.error(friendlyStageError(e));
      // Data mungkin sudah berubah (mis. dipindah staf lain): segarkan papan.
      void qc.invalidateQueries({ queryKey: ["order-board"] });
    } finally {
      setBusy(null);
    }
  }

  const rows = board?.columns[tab] ?? [];
  const total = board?.counts[tab] ?? 0;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold text-navy">Pesanan Masuk</h1>
          <p className="text-xs text-muted-foreground">
            {q.isFetching ? "Memperbarui…" : board ? `Diperbarui ${new Date(board.loadedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : " "}
            {" · otomatis tiap 30 detik"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="min-h-11 shrink-0 rounded-full bg-secondary px-4 text-xs font-bold text-navy"
        >
          Muat ulang
        </button>
      </div>

      {board && !board.scopeBranchId && board.branches.length > 0 && (
        <label className="block text-xs font-bold text-navy">
          Cabang
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-normal"
          >
            <option value="">Semua cabang</option>
            {board.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {board?.scopeBranchId && (
        <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-navy">
          Menampilkan pesanan cabang Anda saja.
        </p>
      )}

      {lateCount > 0 && (
        <button
          type="button"
          onClick={() => setTab("baru")}
          className="w-full rounded-xl border border-destructive bg-destructive/10 px-3 py-3 text-left text-sm font-bold text-destructive"
        >
          {lateCount} pesanan belum dikonfirmasi lebih dari {NEW_ORDER_LATE_MINUTES} menit. Ketuk untuk melihat.
        </button>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Tahap pesanan">
        {ORDER_STAGES.map((s) => {
          const active = tab === s;
          const late = s === "baru" && lateCount > 0;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(s)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold ${
                active ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"
              }`}
            >
              {STAGE_LABEL[s]}
              <span
                className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs ${
                  late ? "bg-destructive text-white" : active ? "bg-white/25" : "bg-card"
                }`}
              >
                {board ? board.counts[s] : "–"}
              </span>
            </button>
          );
        })}
      </div>

      {q.isPending && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {q.isError && (
        <p className="text-sm text-destructive">
          {friendlyStageError(q.error)}
        </p>
      )}
      {board && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Tidak ada pesanan di tahap {STAGE_LABEL[tab]}.
        </p>
      )}
      {board && total > rows.length && (
        <p className="text-xs text-muted-foreground">
          Menampilkan {rows.length} dari {total} pesanan.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((o) => (
          <OrderCard key={o.id} o={o} now={now} busy={busy === o.id} onMove={move} onWhatsapp={openWhatsapp} />
        ))}
      </ul>
    </div>
  );
}

function OrderCard({
  o,
  now,
  busy,
  onMove,
  onWhatsapp,
}: {
  o: BoardOrder;
  now: number;
  busy: boolean;
  onMove: (o: BoardOrder, to: Exclude<OrderStage, "baru">) => void;
  onWhatsapp: (o: BoardOrder, stage: WaStage) => void;
}) {
  const stage = effectiveStage(o);
  const next = nextStage(stage);
  const late = isLateNewOrder(o, now);
  const items = o.order_items ?? [];
  const shown = items.slice(0, 3).map((i) => `${i.quantity}× ${i.name}`);
  const more = items.length - shown.length;
  const border = late ? "border-destructive bg-destructive/5" : "border-border bg-card";

  return (
    <li className={`rounded-2xl border-2 p-3 text-sm ${border}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-extrabold text-navy">{o.order_number}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${late ? "bg-destructive text-white" : "bg-secondary text-navy"}`}>
          {formatAge(ageMinutes(o.created_at, now))}
        </span>
      </div>
      {late && (
        <p className="mt-1 text-xs font-extrabold text-destructive">
          Belum dikonfirmasi &gt; {NEW_ORDER_LATE_MINUTES} menit
        </p>
      )}
      {stage === "baru" && o.status === "pending" && (
        <p className="mt-1 text-xs font-bold text-orange-600">Belum dibayar pelanggan</p>
      )}
      {isLegacyBackfilled(o, now) && !isTerminalStage(stage) && (
        <p className="mt-1 text-xs text-muted-foreground">Pesanan lama (tahap diisi otomatis dari status pembayaran)</p>
      )}
      <p className="mt-1 truncate font-semibold">
        {o.customer_name} <span className="font-normal text-muted-foreground">· {o.city}</span>
      </p>
      <p className="mt-1 text-xs">
        {shown.join(", ") || "Tanpa rincian item"}
        {more > 0 ? ` +${more} lainnya` : ""}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">{o.branch_name ?? "Tanpa cabang"}</span>
        <span className="shrink-0 text-base font-extrabold text-navy">{formatIDR(o.total)}</span>
      </div>
      {o.customer_note && <p className="mt-1 text-xs text-muted-foreground">Catatan: {o.customer_note}</p>}
      {o.stock_shortage && <p className="mt-1 text-xs font-bold text-destructive">Stok kurang saat dibayar. Cek manual.</p>}

      <div className="mt-3 space-y-2">
        {next && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMove(o, next)}
            className="min-h-12 w-full rounded-full bg-primary px-4 text-base font-extrabold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Memproses…" : ADVANCE_LABEL[stage]}
          </button>
        )}
        <div className="flex gap-2">
          {stage !== "baru" && (
            <button
              type="button"
              onClick={() => onWhatsapp(o, stage)}
              className="min-h-11 flex-1 rounded-full border border-primary px-3 text-sm font-bold text-primary"
            >
              Kirim WhatsApp
            </button>
          )}
          {!isTerminalStage(stage) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMove(o, "batal")}
              className="min-h-11 rounded-full border border-destructive px-4 text-sm font-bold text-destructive disabled:opacity-50"
            >
              Batalkan
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
