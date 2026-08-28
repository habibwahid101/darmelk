import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBdt } from "@/lib/offers";
import {
  formatWhen,
  memberById,
  usePlatform,
  type CommissionStatus,
} from "@/lib/platform";

export const Route = createFileRoute("/admin/commission")({
  component: AdminCommission,
});

function AdminCommission() {
  const commissions = usePlatform((s) => s.commissions);
  const members = usePlatform((s) => s.members);
  const adminSetCommissionStatus = usePlatform((s) => s.adminSetCommissionStatus);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Finance"
        title="Commission"
        description="Never hide reversed lines. Amounts are computed from each source booking’s actual confirmed booking amount."
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
            {commissions.map((c) => {
              const earner = memberById(members, c.userId);
              return (
                <li key={c.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {earner?.name ?? "Member"} · L{c.level} · {Math.round(c.rate * 100)}%
                      </p>
                      <p className="text-sm text-muted">
                        {c.sourceOfferTitle} · base {formatBdt(c.bookingAmount)} · {formatBdt(c.amount)} ·{" "}
                        {formatWhen(c.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["pending", "available", "paid", "reversed", "rejected"] as CommissionStatus[]).map(
                      (status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={c.status === status ? "primary" : "secondary"}
                          onClick={() => adminSetCommissionStatus(c.id, status)}
                        >
                          {status}
                        </Button>
                      ),
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </div>
  );
}
