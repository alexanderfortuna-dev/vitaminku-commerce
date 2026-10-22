import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { openInstall } from "@/lib/pwa";
import { OFFICIAL_WHATSAPP_MAIN } from "@/lib/official-contacts";

const PROMO_OPTIN_URL = `https://wa.me/${OFFICIAL_WHATSAPP_MAIN}?text=${encodeURIComponent("Halo VitaminKu, saya ingin dikabari bila ada promo. Nama saya: ")}`;

export function Footer() {
  return (
    <footer className="mt-8 border-t border-border bg-secondary px-4 pb-24 pt-6">
      <div className="mx-auto max-w-3xl">
        <Logo />
        <p className="mt-2 max-w-sm text-xs text-muted-foreground">
          VitaminKu — e-commerce vitamin terlengkap Indonesia. Produk asli, pesanan dikonfirmasi langsung oleh admin kami.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-navy">
          <Link to="/kategori">Kategori</Link>
          <Link to="/tujuan">Kebutuhan</Link>
          <Link to="/bantuan">Bantuan</Link>
          <Link to="/akun">Tersimpan</Link>
          <button type="button" onClick={openInstall} className="min-h-11 -my-3 font-semibold">
            Pasang Aplikasi
          </button>
          <a href={PROMO_OPTIN_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 -my-3 items-center font-semibold">
            Kabari promo via WhatsApp
          </a>
        </div>
        <nav aria-label="Informasi hukum" className="mt-1 flex flex-wrap gap-x-5 text-xs font-semibold text-navy">
          <Link to="/syarat" className="inline-flex min-h-11 items-center">Syarat &amp; Ketentuan</Link>
          <Link to="/privasi" className="inline-flex min-h-11 items-center">Privasi</Link>
          <Link to="/pengembalian" className="inline-flex min-h-11 items-center">Pengembalian</Link>
        </nav>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Informasi produk bukan pengganti nasihat medis. Konsultasikan dengan tenaga kesehatan bila
          kamu memiliki kondisi khusus.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} VitaminKu
        </p>
      </div>
    </footer>
  );
}
