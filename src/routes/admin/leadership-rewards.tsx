import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/leadership-rewards")({
  component: AdminLeadershipLayout,
});

function AdminLeadershipLayout() {
  return <Outlet />;
}
