import { createFileRoute } from "@tanstack/react-router";

// Midtrans HTTP notification. Signature: SHA512(order_id+status_code+gross_amount+server_key).
// Idempotent: replays of the same status are no-ops; stock is decremented once.
export const Route = createFileRoute("/api/public/midtrans/notification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }
        if (!body || typeof body !== "object") return Response.json({ error: "invalid body" }, { status: 400 });
        const { processNotification } = await import("@/lib/checkout.server");
        try {
          const r = await processNotification(body);
          return r.ok ? Response.json({ ok: true, result: r.result }) : Response.json({ error: r.error }, { status: r.status });
        } catch (e) {
          console.error("midtrans notification error", e);
          return Response.json({ error: "not configured" }, { status: 503 });
        }
      },
    },
  },
});
