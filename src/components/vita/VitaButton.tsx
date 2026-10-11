import { lazy, Suspense, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { VitaMascot } from "./VitaMascot";

// Chat bundle (AI SDK + UI) loads only after the first tap.
const VitaChat = lazy(() => import("./VitaChat"));

/** Floating Vita button, stacked above the WhatsApp button (same offsets + 3.5rem). */
export function VitaButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (pathname.startsWith("/admin")) return null;

  const hasStickyBar =
    /^\/produk\//.test(pathname) || pathname.startsWith("/keranjang") || pathname.startsWith("/checkout");

  return (
    <>
      <button
        type="button"
        aria-label="Buka Vita, asisten belanja VitaminKu"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        onPointerEnter={() => void import("./VitaChat")}
        className="fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-vita text-vita-foreground"
        style={{
          bottom: `calc(${hasStickyBar ? "13rem" : "8rem"} + env(safe-area-inset-bottom, 0px))`,
          boxShadow: "var(--shadow-float)",
        }}
      >
        <VitaMascot animated className="h-8 w-8" />
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <VitaChat open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
