import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/career/$slug")({ component: AdminCareerSlugLayout });

function AdminCareerSlugLayout() {
  return <Outlet />;
}
