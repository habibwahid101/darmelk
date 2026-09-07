import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/merchant/")({
  component: AdminMerchantOverview,
});

function AdminMerchantOverview() {
  const { data, loading } = useAsync(() => api.admin.merchantOverview(), []);
  const overview = data?.overview;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant Management"
        title="Merchant Management"
        description="Audit Merchant bundles, credit issuance, payment requests, and gift fulfillment. Balances cannot be overwritten."
        action={
          <Button asChild size="sm">
            <Link to="/admin/merchant/bundles/new">Add bundle</Link>
          </Button>
        }
      />
      {loading && !overview ? (
        <p className="text-sm text-muted">Loading Merchant overview…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active Merchants" value={String(overview?.active_merchants ?? 0)} />
            <StatCard label="Pending activations" value={String(overview?.pending_purchases ?? 0)} hint="Unconfirmed bundle purchases" />
            <StatCard label="Open payment requests" value={String(overview?.pending_requests ?? 0)} />
            <StatCard
              label="Credit issued"
              value={formatBdt((overview?.purchased_issued ?? 0) + (overview?.bonus_issued ?? 0))}
              hint={`${formatBdt(overview?.purchased_issued ?? 0)} purchased · ${formatBdt(overview?.bonus_issued ?? 0)} bonus`}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Available" value={formatBdt(overview?.available ?? 0)} />
            <StatCard label="Reserved" value={formatBdt(overview?.reserved ?? 0)} />
            <StatCard label="Settled" value={formatBdt(overview?.settled ?? 0)} />
          </div>
          <Surface>
            <h2 className="font-display text-xl font-semibold">Recent ledger activity</h2>
            {(overview?.recent ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted">No Merchant Credit movements yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {overview!.recent.map((row) => (
                  <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.entry_type.replaceAll("_", " ")}</p>
                      <p className="truncate text-xs text-muted">{row.merchant_user_id}</p>
                    </div>
                    <div className="text-sm">
                      <p className="tabular-nums">{formatBdt(row.amount)}</p>
                      <p className="text-xs text-muted">{formatWhen(row.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}