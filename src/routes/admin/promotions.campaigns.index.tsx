import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/promotions/campaigns/")({
  component: AdminPromotionCampaigns,
});

function AdminPromotionCampaigns() {
  const { data, reload, loading } = useAsync(() => api.admin.promotions(), []);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const promotions = data?.promotions ?? [];

  async function publish(id: string) {
    setPending(id);
    setError(null);
    try {
      await api.admin.setPromotionStatus(id, "published");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish this promotion.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Promotion Management"
        title="Campaigns"
        description="Draft campaigns stay private. Publishing makes an eligible window available to members."
        action={
          <Button asChild size="sm">
            <Link to="/admin/promotions/campaigns/new">Create promotion</Link>
          </Button>
        }
      />
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted">Loading campaigns…</p>
      ) : promotions.length === 0 ? (
        <EmptyState icon={Megaphone} title="No promotions yet" description="Create a draft, add rewards and eligible properties, then publish." />
      ) : (
        <ul className="grid gap-3">
          {promotions.map((promo) => (
            <li key={promo.id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{promo.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {formatWhen(promo.start_at)} – {formatWhen(promo.end_at)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {promo.rewards.map((r) => r.name).join(" · ") || "No rewards"}
                  </p>
                </div>
                <StatusBadge status={promo.lifecycle} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/admin/promotions/campaigns/$id" params={{ id: promo.id }}>
                    Edit
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/admin/promotions/campaigns/$id/preview" params={{ id: promo.id }}>
                    Preview
                  </Link>
                </Button>
                {promo.status === "draft" ? (
                  <Button size="sm" disabled={pending === promo.id} onClick={() => void publish(promo.id)}>
                    Publish
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
