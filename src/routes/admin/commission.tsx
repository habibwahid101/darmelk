import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/commission")({
  component: AdminCommission,
});

function AdminCommission() {
  const { data } = useAsync(() => api.admin.commissions(), []);
  const commissions = data?.commissions ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Finance"
        title="Commission"
        description="Never hide reversed lines. Amounts are computed from each source booking’s actual confirmed booking amount. Status changes automatically with booking confirmation, reversal, and withdrawal payout."
      />
      {commissions.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No commission lines"
          description="Lines are created when a confirmed booking has an upline sponsor."
        />
      ) : (
        <Surface className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {commissions.map((c) => (
              <li key={c.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {c.beneficiary_name ?? c.beneficiary_user_id} · L{c.level} · {Math.round(c.rate * 100)}%
                    </p>
                    <p className="text-sm text-muted">
                      {c.source_offer_title ?? "—"} · base {formatBdt(c.source_booking_amount)} ·{" "}
                      {formatBdt(c.amount)} · {formatWhen(c.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
