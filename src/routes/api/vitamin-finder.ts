import { createFileRoute } from "@tanstack/react-router";

// Asisten Vita (Vitamin Finder) di server Vercel. Dipakai chat bila VITE_VITAMIN_FINDER_URL=/api/vitamin-finder.
export const Route = createFileRoute("/api/vitamin-finder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleVitaminFinder } = await import("@/lib/vitamin-finder.server");
        return handleVitaminFinder(request);
      },
    },
  },
});
