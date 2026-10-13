import { createFileRoute } from "@tanstack/react-router";

// Galat dari browser pengunjung → admin_audit_log ('client_error'). Publik tapi ber-batas-laju,
// berukuran kecil, dan tanpa data pribadi (lihat error-payload.ts).
export const Route = createFileRoute("/api/public/client-error")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleClientError } = await import("@/lib/error-report.server");
        return handleClientError(request);
      },
    },
  },
});
