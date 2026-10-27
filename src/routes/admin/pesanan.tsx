import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatIDR } from "@/lib/format";
import { listAdminOrders, updateAdminOrder, type OrderStatusFilter } from "@/lib/admin-orders.functions";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";
import { PaymentLinkPanel } from "@/components/admin/PaymentLinkPanel";

export const Route = createFileRoute("/admin/pesanan")({
  head: () => ({
    meta: [
      { title: "Semua Pesanan — Seller Center | VitaminKu" },
      { name: "description", content: "Daftar pesanan VitaminKu dengan filter status." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminOrdersPage,
});

const FILTERS: Array<{ value: OrderStatusFilter; label: string }> = [
  { value: "ALL", label: "Semua" },
  { value: "menunggu_konfirmasi", label: "Perlu Konfirmasi" },
  { value: "pending", label: "Menunggu Bayar" },
  { value: "paid", label: "Dibayar" },
  { value: "expired", label: "Kedaluwarsa" },
  { value: "cancelled", label: "Batal" },
];
const LABEL: Record<string, string> = { menunggu_konfirmasi: "Perlu konfirmasi", pending: "Menunggu bayar", paid: "Dibayar", expired: "Kedaluwarsa", cancelled: "Batal" };

function AdminOrdersPage() {
  const role = (useAdminRole().data?.role ?? null) as null | "owner" | "admin" | "seller";
  const [status, setStatus] = useState<OrderStatusFilter>("ALL");
  const fetchOrders = useServerFn(listAdminOrders);
  const act = useServerFn(updateAdminOrder);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(orderId: string, orderNumber: string, action: "confirm" | "cancel") {
    const msg = action === "confirm" ? `Konfirmasi ${orderNumber} sebagai dibayar? Stok akan dikurangi.` : `Batalkan ${orderNumber}?`;
    if (!window.confirm(msg)) return;
    setBusy(orderId);
    try {
      await act({ data: { orderId, action } });
      toast.success(action === "confirm" ? "Pesanan ditandai dibayar" : "Pesanan dibatalkan");
      await qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(null);
    }
  }
  const q = useInfiniteQuery({
    queryKey: ["admin-orders", status],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchOrders({ data: { status, offset: pageParam } }),
    getNextPageParam: (p) => p.nextOffset ?? undefined,
    enabled: canEditCommerce(role),
    retry: false,
  });
  if (!canEditCommerce(role)) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk admin/owner.</p>;
  const orders = q.data?.pages.flatMap((p) => p.orders) ?? [];

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-extrabold text-navy">Semua Pesanan</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${status === f.value ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {q.isPending && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && <p className="text-xs text-muted-foreground">{q.data.pages[0]?.total ?? 0} pesanan</p>}
      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id} className="rounded-2xl border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-navy">{o.order_number}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold">
                {LABEL[o.status] ?? o.status}
                {o.payment_mode === "whatsapp" ? " · WA" : ""}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {o.customer_name} · {o.whatsapp} · {o.city}
            </p>
            <p className="mt-1 line-clamp-2 text-xs">
              {(o.order_items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ")}
            </p>
            {(o.referral_code || o.promo_code || o.customer_note) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {[o.referral_code && `Ref: ${o.referral_code}`, o.promo_code && `Promo: ${o.promo_code} (-${formatIDR(o.discount_total ?? 0)})`, o.customer_note && `Catatan: ${o.customer_note}`].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-muted-foreground">
                {new Date(o.created_at).toLocaleString("id-ID")} · {o.courier_label}
              </span>
              <span className="font-bold text-navy">{formatIDR(o.total)}</span>
            </div>
            {(o.status === "menunggu_konfirmasi" || o.status === "pending" || o.status === "paid") && (
              <div className="mt-2 flex gap-2">
                {o.status !== "paid" && (
                  <button
                    type="button"
                    disabled={busy === o.id}
                    onClick={() => void run(o.id, o.order_number, "confirm")}
                    className="flex-1 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                  >
                    Konfirmasi & Tandai Dibayar
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => void run(o.id, o.order_number, "cancel")}
                  className="rounded-full border border-destructive px-3 py-2 text-xs font-bold text-destructive disabled:opacity-50"
                >
                  Batalkan
                </button>
              </div>
            )}
            {o.payment_mode === "whatsapp" && (o.status === "menunggu_konfirmasi" || o.status === "pending") && <PaymentLinkPanel order={o} />}
            {o.stock_shortage && <p className="mt-1 text-xs font-bold text-destructive">Stok kurang saat dibayar — cek manual.</p>}
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <button type="button" onClick={() => void q.fetchNextPage()} className="w-full rounded-full bg-secondary px-4 py-2 text-sm font-bold text-navy">
          {q.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
    </div>
  );
}
