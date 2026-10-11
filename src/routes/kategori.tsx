import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/kategori")({
  component: () => <Outlet />,
});
