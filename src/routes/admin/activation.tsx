import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

const ACTIVATION_FEE = 1000;

export const Route = createFileRoute("/admin/activation")({
  component: AdminActivation,
});

function AdminActivation() {
  const { data, reload } = useAsync(() => api.admin.activations(), []);
  const { data: usersData } = useAsync(() => api.admin.users(), []);
  const activations = data?.activations ?? [];
  const names = new Map((usersData?.members ?? []).map((m) => [m.user_id, m.name]));

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Activation"
        title="Annual activation"
        description={`Fee ${formatBdt(ACTIVATION_FEE)}. Separate from property booking and commission.`}
      />
      {activations.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="No activation requests"
          description="Requests appear when a member requests annual activation."
        />
      ) : (
        <Surface className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {activations.map((a) => (
              <li key={a.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{names.get(a.user_id) ?? a.user_id}</p>
                    <p className="text-sm text-muted">
                      Requested {formatWhen(a.requested_at)}
                      {a.period_end ? ` · Expires ${formatWhen(a.period_end)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                {a.status === "pending" ? (
                  <p className="text-sm text-muted">Review the member’s payment evidence in Payment review.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
