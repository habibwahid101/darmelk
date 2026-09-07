import { createFileRoute, Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/merchant/accounts/")({
  component: AdminMerchantAccounts,
});

function AdminMerchantAccounts() {
  const { data, loading } = useAsync(() => api.admin.merchants(), []);
  const rows = data?.merchants ?? [];

  return (
    <div className="space-y-8">
      <PageHeader kicker="Merchant Management" title="Merchant accounts" description="Inspect status and credit. There is no raw balance overwrite." />
      {loading && !data ? (
        <p className="text-sm text-muted">Loading Merchants…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Store} title="No Merchants yet" description="A Merchant account appears after a bundle purchase is started." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.user_id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name ?? "Merchant"}</p>
                  <p className="truncate text-sm text-muted">{row.email}</p>
                  <p className="mt-1 break-all text-xs text-subtle">{row.user_id}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 text-sm">
                Available {formatBdt(row.available)} · Reserved {formatBdt(row.reserved)} · Settled {formatBdt(row.settled)}
              </p>
              <Button asChild size="sm" variant="secondary" className="mt-4">
                <Link to="/admin/merchant/accounts/$userId" params={{ userId: row.user_id }}>
                  Open account
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
