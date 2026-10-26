import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Link2, MessageCircle } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { getCheckoutModes } from "@/lib/checkout.functions";
import { createPaymentLink } from "@/lib/payment-link.functions";
import type { AdminOrderRow } from "@/lib/admin-orders.functions";

/**
 * Link bayar untuk pesanan WhatsApp: staf mengisi ongkir (bila belum dihitung kurir), sistem membuat link Midtrans dari total di database.
 * Pelanggan membayar di link; status "Dibayar" berubah otomatis lewat webhook. Staf yang mengirim linknya lewat WhatsApp.
 */
export function PaymentLinkPanel({ order }: { order: AdminOrderRow }) {
  const qc = useQueryClient();
  const manual = order.shipping_mode === "manual";
  const fetchModes = useServerFn(getCheckoutModes);
  const modes = useQuery({ queryKey: ["checkout-modes"], queryFn: () => fetchModes(), staleTime: 60_000, retry: false });
  const make = useServerFn(createPaymentLink);
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(manual && order.shipping_cost > 0 ? String(order.shipping_cost) : "");
  const [result, setResult] = useState<{ url: string; waUrl: string; total: number; reused: boolean } | null>(null);
  const ready = modes.data?.ok === true && modes.data.payment === "midtrans";

  const mutate = useMutation({
    mutationFn: () => make({ data: { orderId: order.id, ...(manual ? { shippingCost: Number(cost.replace(/\D/g, "")) } : {}) } }),
    onSuccess: (r) => {
      setResult(r);
      toast.success(r.reused ? "Link bayar yang sudah ada" : "Link bayar dibuat");
      void qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat link bayar"),
  });

  if (!ready) {
    return <p className="mt-2 text-[11px] text-muted-foreground">Link bayar (QRIS, e-wallet, VA): aktif setelah kunci Midtrans dipasang.</p>;
  }
  const existing = result?.url ?? order.payment_url;
  return (
    <div className="mt-2 rounded-xl border border-border bg-secondary/40 p-2">
      {!open && !existing && (
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary px-3 py-2 text-xs font-bold text-primary">
          <Link2 className="h-4 w-4" /> Buat link bayar
        </button>
      )}
      {open && !existing && (
        <div className="space-y-2">
          {manual ? (
            <label className="block text-xs font-semibold text-navy">
              Ongkir yang disepakati dengan pelanggan (Rp)
              <input
                inputMode="numeric"
                value={cost}
                onChange={(e) => setCost(e.target.value.replace(/\D/g, ""))}
                placeholder="mis. 25000 (isi 0 bila gratis)"
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
              />
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">Ongkir sudah dihitung kurir. Total tagihan {formatIDR(order.total)}.</p>
          )}
          <button
            type="button"
            disabled={mutate.isPending || (manual && cost === "")}
            onClick={() => mutate.mutate()}
            className="min-h-11 w-full rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {mutate.isPending ? "Membuat…" : "Buat link"}
          </button>
        </div>
      )}
      {existing && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-navy">Link bayar {result ? `· total ${formatIDR(result.total)}` : ""}</p>
          <p className="break-all rounded-lg bg-card px-2 py-1 text-[11px] text-muted-foreground">{existing}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void navigator.clipboard.writeText(existing).then(() => toast.success("Link disalin"))} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-secondary px-3 text-xs font-bold text-navy">
              <Copy className="h-4 w-4" /> Salin
            </button>
            {result && (
              <a href={result.waUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground">
                <MessageCircle className="h-4 w-4" /> Kirim via WhatsApp
              </a>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Setelah pelanggan membayar, status berubah otomatis menjadi Dibayar.</p>
        </div>
      )}
    </div>
  );
}
