import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/offers/$slug")({ component: AdminOfferSlugLayout });

function AdminOfferSlugLayout() {
  return <Outlet />;
}
