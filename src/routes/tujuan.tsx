import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tujuan")({
  component: () => <Outlet />,
});
