import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/merchant")({
  component: AdminMerchantLayout,
});

const TABS = [
  { to: "/admin/merchant", label: "Overview", exact: true },
  { to: "/admin/merchant/bundles", label: "Bundles" },
  { to: "/admin/merchant/accounts", label: "Merchants" },
  { to: "/admin/merchant/requests", label: "Requests" },
  { to: "/admin/merchant/ledger", label: "Ledger" },
  { to: "/admin/merchant/gifts", label: "Gifts" },
] as const;

function AdminMerchantLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-6">
      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label="Merchant Management">
        {TABS.map((tab) => {
          const active = "exact" in tab && tab.exact ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "shrink-0 rounded-full px-3 py-2 text-sm font-medium",
                active ? "bg-pine text-pine-fg" : "text-ink/75 hover:bg-ink/5",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}