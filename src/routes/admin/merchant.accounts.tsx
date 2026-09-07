import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/merchant/accounts")({
  component: AdminMerchantAccountsLayout,
});

function AdminMerchantAccountsLayout() {
  return <Outlet />;
}
