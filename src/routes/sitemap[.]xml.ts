import { createFileRoute } from "@tanstack/react-router";

// Sitemap dinamis: hanya produk aktif, tidak diblokir, harga > 0, plus kategori/merek/halaman utama dan halaman hukum.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleSitemap } = await import("@/lib/sitemap.server");
        return handleSitemap(request);
      },
    },
  },
});
