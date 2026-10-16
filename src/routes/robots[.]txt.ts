import { createFileRoute } from "@tanstack/react-router";

// Menggantikan public/robots.txt agar baris "Sitemap:" memakai alamat situs yang sebenarnya.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleRobots } = await import("@/lib/sitemap.server");
        return handleRobots(request);
      },
    },
  },
});
