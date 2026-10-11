import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/seller/pengaturan")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/pengaturan", replace: true });
  },
});
