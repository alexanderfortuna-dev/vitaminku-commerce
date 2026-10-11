import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import {
  OPEN_EVENT, canPromptInstall, dismiss, initPwa, isDismissed, isIos, isStandalone,
  onInstallChange, promptInstall,
} from "@/lib/pwa";

/** Banner above the bottom nav; left of the floating WhatsApp/Vita column. */
export function InstallPrompt() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mode, setMode] = useState<"none" | "android" | "ios">("none");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    initPwa();
    const evaluate = (force = false) => {
      if (isStandalone()) return setVisible(false);
      const m = canPromptInstall() ? "android" : isIos() ? "ios" : "none";
      setMode(m);
      if (m !== "none" && (force || !isDismissed())) setVisible(true);
    };
    evaluate();
    const off = onInstallChange(() => evaluate());
    const open = () => evaluate(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => { off(); window.removeEventListener(OPEN_EVENT, open); };
  }, []);

  if (!visible || mode === "none" || pathname.startsWith("/admin") || pathname.startsWith("/checkout") || /^\/produk\//.test(pathname) || pathname.startsWith("/keranjang")) return null;

  return (
    <div
      role="dialog"
      aria-label="Pasang Aplikasi VitaminKu"
      className="fixed left-3 right-20 z-40 flex items-center gap-2 rounded-2xl border border-border bg-card p-2 pl-3"
      style={{ bottom: `calc(4.5rem + env(safe-area-inset-bottom, 0px))`, boxShadow: "var(--shadow-float)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-navy">Pasang Aplikasi VitaminKu</p>
        {mode === "ios" && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Ketuk Bagikan <Share className="h-3.5 w-3.5" /> lalu Tambah ke Layar Utama
          </p>
        )}
      </div>
      {mode === "android" && (
        <button
          type="button"
          onClick={() => void promptInstall().then(() => setVisible(false))}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <Download className="h-4 w-4" /> Pasang
        </button>
      )}
      <button
        type="button"
        aria-label="Tutup"
        onClick={() => { dismiss(); setVisible(false); }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
