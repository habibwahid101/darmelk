import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/states";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/promotions/")({
  component: AdminPromotionsOverview,
});

function AdminPromotionsOverview() {
  const { data, loading } = useAsync(() => api.admin.promotionOverview(), []);
  const overview = data?.overview;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Promotion Management"
        title="Promotion Management"
        description="Campaigns reward confirmed property bookings inside a server-side window. Qualification never posts commission or changes Merchant Credit."
        action={
          <Button asChild size="sm">
            <Link to="/admin/promotions/campaigns/new">Create promotion</Link>
          </Button>
        }
      />
      {loading && !overview ? (
        <p className="text-sm text-muted">Loading promotions…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Active promotions" value={String(overview?.active ?? 0)} />
          <StatCard label="Draft promotions" value={String(overview?.draft ?? 0)} />
          <StatCard label="Upcoming promotions" value={String(overview?.upcoming ?? 0)} />
          <StatCard label="Expired promotions" value={String(overview?.expired ?? 0)} />
          <StatCard label="Qualified members" value={String(overview?.qualified_members ?? 0)} />
          <StatCard label="Pending reward fulfillment" value={String(overview?.pending_fulfillment ?? 0)} />
        </div>
      )}
    </div>
  );
}
