import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/promotions")({
  component: MemberPromotionsLayout,
});

function MemberPromotionsLayout() {
  return <Outlet />;
}
