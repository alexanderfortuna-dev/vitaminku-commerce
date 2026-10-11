import { createFileRoute, redirect } from "@tanstack/react-router";

// Seller Center lives in the existing admin panel; /seller is a friendly alias.
export const Route = createFileRoute("/seller")({
  beforeLoad: ({ location }) => {
    if (location.pathname.startsWith("/seller/pengaturan")) throw redirect({ to: "/admin/pengaturan", replace: true });
    throw redirect({ to: "/admin", replace: true });
  },
});
