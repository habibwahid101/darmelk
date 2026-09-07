import { createFileRoute } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError, type PromotionFulfillment } from "@/lib/api-client";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/promotions/rewards")({
  component: AdminPromotionRewards,
});

function AdminPromotionRewards() {
  const { data, reload, loading } = useAsync(() => api.admin.promotionRewards(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const rows = data?.rewards ?? [];

  async function setStatus(id: string, status: PromotionFulfillment["status"]) {
    setBusy(`${id}:${status}`);
    setError(null);
    try {
      await api.admin.setPromotionRewardStatus(id, status, reason[id]);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this reward.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Promotion Management"
        title="Reward fulfillment"
        description="Eligibility and fulfillment are separate. Qualification does not mark a reward delivered. Every status change is audited."
      />
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted">Loading rewards…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Gift} title="No reward records" description="Individual rewards appear after a member qualifies." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {row.quantity} × {row.reward_name}
                  </p>
                  <p className="text-sm text-muted">
                    {row.user_name} · {row.promotion_title}
                  </p>
                  <p className="break-all text-xs text-subtle">{row.user_id}</p>
                  <p className="mt-1 text-xs text-muted">{formatWhen(row.updated_at)}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <Input
                className="mt-4"
                placeholder="Reason / note"
                value={reason[row.id] ?? ""}
                onChange={(e) => setReason((current) => ({ ...current, [row.id]: e.target.value }))}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {row.status === "eligible" ? (
                  <Button size="sm" disabled={busy === `${row.id}:approved`} onClick={() => void setStatus(row.id, "approved")}>
                    Approve
                  </Button>
                ) : null}
                {row.status === "approved" ? (
                  <Button size="sm" disabled={busy === `${row.id}:fulfilled`} onClick={() => void setStatus(row.id, "fulfilled")}>
                    Mark fulfilled
                  </Button>
                ) : null}
                {row.status === "eligible" || row.status === "approved" ? (
                  <Button size="sm" variant="secondary" disabled={busy === `${row.id}:cancelled`} onClick={() => void setStatus(row.id, "cancelled")}>
                    Cancel
                  </Button>
                ) : null}
                {row.status === "fulfilled" || row.status === "approved" || row.status === "eligible" ? (
                  <Button size="sm" variant="secondary" disabled={busy === `${row.id}:reversed`} onClick={() => void setStatus(row.id, "reversed")}>
                    Reverse
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
