import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/merchant/bundles")({
  component: AdminMerchantBundlesLayout,
});

function AdminMerchantBundlesLayout() {
  return <Outlet />;
}
