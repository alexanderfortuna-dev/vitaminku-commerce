import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vita-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleVitaChat } = await import("@/lib/vita-chat.server");
        return handleVitaChat(request);
      },
    },
  },
});
