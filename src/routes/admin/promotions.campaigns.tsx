import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/promotions/campaigns")({
  component: AdminPromotionCampaignsLayout,
});

function AdminPromotionCampaignsLayout() {
  return <Outlet />;
}
