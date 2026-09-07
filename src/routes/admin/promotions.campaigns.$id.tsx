import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/promotions/campaigns/$id")({
  component: AdminPromotionCampaignLayout,
});

function AdminPromotionCampaignLayout() {
  return <Outlet />;
}
