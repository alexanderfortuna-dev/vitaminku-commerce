import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { openInstall } from "@/lib/pwa";

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
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
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
