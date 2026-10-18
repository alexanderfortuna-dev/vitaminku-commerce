import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { productQueryOptions } from "@/lib/catalog-db";

import { OFFICIAL_WHATSAPP_MAIN } from "@/lib/official-contacts";

export const WHATSAPP_NUMBER = OFFICIAL_WHATSAPP_MAIN;

export function whatsappLink(productName?: string | null): string {
  const text = productName
    ? `Halo VitaminKu, saya ingin bertanya tentang produk "${productName}".`
    : "Halo VitaminKu, saya ingin bertanya tentang produk.";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

/** Floating WhatsApp chat button, kept above the bottom nav and any sticky CTA bar. */
export function WhatsAppButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const productMatch = pathname.match(/^\/produk\/([^/]+)/);
  const handle = productMatch ? decodeURIComponent(productMatch[1]!) : "";
  const { data: product } = useQuery({ ...productQueryOptions(handle), enabled: Boolean(handle) });
  // Product name only after hydration so server and client HTML match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (pathname.startsWith("/admin")) return null;

  // Pages with a sticky action bar above the bottom nav need extra lift.
  const hasStickyBar = Boolean(productMatch) || pathname.startsWith("/keranjang") || pathname.startsWith("/checkout");

  return (
    <a
      href={whatsappLink(mounted ? product?.name : null)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat via WhatsApp"
      className="fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground"
      style={{
        bottom: `calc(${hasStickyBar ? "9.5rem" : "4.5rem"} + env(safe-area-inset-bottom, 0px))`,
        boxShadow: "var(--shadow-float)",
      }}
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
