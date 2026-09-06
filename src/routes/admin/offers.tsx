import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/offers")({ component: AdminOffersLayout });

function AdminOffersLayout() {
  return <Outlet />;
}
