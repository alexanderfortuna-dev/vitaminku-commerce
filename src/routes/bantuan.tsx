import { Link, createFileRoute } from "@tanstack/react-router";
import { CreditCard, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { OFFICIAL_WHATSAPPS } from "@/lib/official-contacts";

const FAQ = [
  {
    q: "Apakah produk yang dijual VitaminKu asli?",
    a: "VitaminKu berkomitmen hanya menjual produk asli dan tersegel. Informasi merek, ukuran, dan kemasan ditampilkan apa adanya sesuai data produk di toko.",
  },
  {
    q: "Metode pembayaran apa saja yang tersedia?",
    a: "Pilihan pembayaran yang aktif ditampilkan pada halaman pembayaran saat kamu menyelesaikan pesanan. Daftar metode dapat berbeda sesuai pengaturan toko dan lokasi kamu.",
  },
  {
    q: "Bisakah checkout tanpa membuat akun?",
    a: "Bisa. Checkout tamu tersedia — cukup isi alamat pengiriman lalu pilih metode pembayaran yang muncul di halaman pembayaran.",
  },
  {
    q: "Berapa lama pengiriman?",
    a: "Pilihan pengiriman beserta estimasi dan biayanya ditampilkan pada halaman pembayaran sesuai alamat tujuan kamu.",
  },
  {
    q: "Bagaimana kebijakan pengembalian?",
    a: "Pengembalian mengikuti kebijakan toko yang berlaku pada halaman pembayaran dan konfirmasi pesanan. Bila produk diterima rusak atau salah kirim, hubungi kami lewat email dengan foto bukti.",
  },
  {
    q: "Bagaimana cara menghubungi VitaminKu?",
    a: "Selama masa beta, dukungan dilayani melalui email pada jam kerja. Kanal chat resmi akan ditampilkan di sini setelah nomornya aktif.",
  },
];

export const Route = createFileRoute("/bantuan")({
  head: () => ({
    meta: [
      { title: "Bantuan & Informasi Pesanan — VitaminKu" },
      {
        name: "description",
        content:
          "Informasi seputar keaslian produk, pembayaran, pengiriman, dan pengembalian di VitaminKu.",
      },
      { property: "og:title", content: "Bantuan & Informasi Pesanan — VitaminKu" },
      {
        property: "og:description",
        content: "Pertanyaan umum seputar pesanan, pembayaran, dan pengiriman VitaminKu.",
      },
      { property: "og:url", content: "/bantuan" },
    ],
    links: [{ rel: "canonical", href: "/bantuan" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="px-4 py-4 pb-8">
      <h1 className="text-lg font-extrabold">Bantuan</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Butuh bantuan pesanan? Kirim email ke tim kami dan sertakan nomor pesanan bila ada.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3">
        {[
          { icon: ShieldCheck, label: "Keaslian Produk" },
          { icon: CreditCard, label: "Pembayaran" },
          { icon: Truck, label: "Pengiriman" },
          { icon: PackageCheck, label: "Pengembalian" },
        ].map((item) => (
          <li key={item.label} className="flex items-center gap-2 p-3 card-surface">
            <item.icon className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm font-semibold text-navy">{item.label}</span>
          </li>
        ))}
      </ul>

      <section className="mt-6">
        <h2 className="text-base font-extrabold">Pertanyaan yang sering diajukan</h2>
        <div className="mt-3 divide-y divide-border overflow-hidden card-surface">
          {FAQ.map((item) => (
            <details key={item.q} className="p-4">
              <summary className="cursor-pointer text-sm font-semibold text-navy">{item.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-6 p-4 card-surface">
        <h2 className="text-sm font-extrabold text-navy">Hubungi kami</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nomor WhatsApp resmi VitaminKu. Hati-hati penipuan: kami tidak meminta kode OTP atau
          pembayaran ke rekening pribadi di luar halaman pesanan.
        </p>
        <ul className="mt-3 space-y-2">
          {OFFICIAL_WHATSAPPS.map((w) => (
            <li key={w.number}>
              <a
                href={`https://wa.me/${w.number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-between rounded-xl border border-border px-4 text-sm font-semibold text-navy"
              >
                <span>{w.label}</span>
                <span className="text-primary">{w.display}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <Link to="/" className="mt-6 block text-center text-sm font-semibold text-primary">
        Kembali ke beranda
      </Link>
    </div>
  );
}
