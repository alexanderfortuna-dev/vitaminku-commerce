import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Copy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "@/lib/format";
import { getOrderByToken, getOrderContacts } from "@/lib/checkout.functions";
import { whatsappOrderUrl } from "@/lib/whatsapp-order";
import { WHATSAPP_NUMBER } from "@/components/WhatsAppButton";

export const Route = createFileRoute("/pesanan/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Status Pesanan — VitaminKu" },
      { name: "description", content: "Lihat status pembayaran dan rincian pesanan VitaminKu kamu." },
      { property: "og:title", content: "Status Pesanan — VitaminKu" },
      { property: "og:description", content: "Status pembayaran dan rincian pesanan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrderPage,
});

const STATUS = {
  pending: { label: "Menunggu pembayaran", Icon: Clock, tone: "text-navy" },
  menunggu_konfirmasi: { label: "Menunggu konfirmasi admin", Icon: Clock, tone: "text-navy" },
  paid: { label: "Pembayaran diterima", Icon: CheckCircle2, tone: "text-primary" },
  expired: { label: "Pembayaran kedaluwarsa", Icon: XCircle, tone: "text-destructive" },
  cancelled: { label: "Dibatalkan", Icon: XCircle, tone: "text-destructive" },
} as const;

function OrderPage() {
  const { token } = Route.useParams();
  const fetchOrder = useServerFn(getOrderByToken);
  const { data: order, isPending, isError } = useQuery({
    queryKey: ["order", token],
    queryFn: () => fetchOrder({ data: { token } }),
    refetchInterval: (q) => (q.state.data?.status === "pending" || q.state.data?.status === "menunggu_konfirmasi" ? 10000 : false),
    retry: false,
  });

  const fetchContacts = useServerFn(getOrderContacts);
  const contacts = useQuery({
    queryKey: ["order-contacts", token],
    queryFn: () => fetchContacts({ data: { token } }),
    enabled: !!order,
    retry: false,
    staleTime: 60_000,
  });

  if (isPending) return <p className="p-4 text-sm text-muted-foreground">Memuat pesanan…</p>;
  if (isError || !order) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-bold">Pesanan tidak ditemukan</p>
        <Link to="/" className="mt-4 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">
          Ke Beranda
        </Link>
      </div>
    );
  }

  const s = STATUS[order.status] ?? STATUS.pending;
  const awaitingWa = order.status === "menunggu_konfirmasi";
  const waNumber = order.branch_whatsapp || WHATSAPP_NUMBER;
  const waLink = (number: string) =>
    awaitingWa
      ? whatsappOrderUrl(number, { ...order, note: order.customer_note ?? null })
      : `https://wa.me/${number}?text=${encodeURIComponent(`Halo VitaminKu, saya ingin menanyakan pesanan ${order.order_number}.`)}`;
  const wa = waLink(waNumber);
  const otherAdmins = contacts.data?.others ?? [];
  const canSave = contacts.data?.canSave === true;
  const manual = order.shipping_mode === "manual";

  return (
    <div className="space-y-4 px-4 py-5 pb-28">
      <div className="rounded-2xl border border-border bg-card p-4 text-center">
        <s.Icon className={`mx-auto h-10 w-10 ${s.tone}`} />
        <p className={`mt-2 text-base font-extrabold ${s.tone}`}>{s.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">No. pesanan</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(order.order_number).then(
              () => toast.success("Nomor pesanan disalin."),
              () => toast.error("Tidak bisa menyalin. Catat nomornya ya."),
            );
          }}
          aria-label={`Salin nomor pesanan ${order.order_number}`}
          className="mx-auto inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-lg font-extrabold tracking-wide text-navy"
        >
          {order.order_number} <Copy className="h-4 w-4 text-muted-foreground" />
        </button>
        {order.branch_name && <p className="mt-1 text-xs text-muted-foreground">Cabang: {order.branch_name}</p>}
      </div>

      {awaitingWa && (
        <p className="rounded-xl bg-primary-soft px-3 py-2 text-xs text-accent-foreground">
          Kirim pesanan ini ke admin lewat WhatsApp. Admin akan mengonfirmasi stok{manual ? ", ongkir" : ""} dan cara pembayaran.
        </p>
      )}
      {order.status === "pending" && order.payment_url && (
        <a href={order.payment_url} className="block rounded-full bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground">
          Lanjutkan Pembayaran
        </a>
      )}
      <ul className="space-y-1 rounded-2xl border border-border bg-card p-4 text-sm">
        {order.items.map((i) => (
          <li key={i.slug} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">{i.quantity}× {i.name}</span>
            <span className="shrink-0">{formatIDR(i.line_total)}</span>
          </li>
        ))}
        {!!order.discount_total && (
          <li className="flex justify-between border-t border-border pt-1 text-primary">
            <span>Diskon{order.promo_code ? ` (${order.promo_code})` : ""}</span>
            <span>-{formatIDR(order.discount_total)}</span>
          </li>
        )}
        <li className="flex justify-between border-t border-border pt-1 text-muted-foreground">
          <span>{manual ? "Ongkir" : `Ongkir · ${order.courier_label}`}</span>
          <span>{manual ? "dikonfirmasi cabang" : formatIDR(order.shipping_cost)}</span>
        </li>
        <li className="flex justify-between pt-1 text-base font-extrabold text-navy">
          <span>{manual ? "Total (+ ongkir)" : "Total"}</span>
          <span>{formatIDR(order.total)}</span>
        </li>
      </ul>

      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        className={`block rounded-full px-4 py-3 text-center text-sm font-bold ${awaitingWa ? "bg-primary text-primary-foreground" : "border border-primary text-primary"}`}
      >
        {awaitingWa ? "Kirim Pesanan via WhatsApp" : "Tanya via WhatsApp"}
      </a>
      {otherAdmins.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Belum dibalas?{" "}
          {otherAdmins.map((a, i) => (
            <span key={a.whatsapp}>
              {i > 0 && " · "}
              <a href={waLink(a.whatsapp)} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">
                Admin lain{otherAdmins.length > 1 ? ` ${i + 1}` : ""}
              </a>
            </span>
          ))}
        </p>
      )}
      {canSave && (
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground">Pesan berikutnya lebih cepat: nama dan alamat terisi otomatis, dan riwayat pesananmu tersimpan.</p>
          <a
            href={`/masuk?next=/pesanan/${token}`}
            className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-secondary px-4 text-sm font-bold text-navy"
          >
            Simpan data saya
          </a>
        </div>
      )}
      <p className="text-center text-[11px] text-muted-foreground">Simpan link halaman ini untuk cek status pesanan.</p>
    </div>
  );
}
