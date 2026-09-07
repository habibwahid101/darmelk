import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/career")({ component: AdminCareerLayout });

function AdminCareerLayout() {
  return <Outlet />;
}
