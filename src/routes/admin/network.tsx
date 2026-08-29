import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { COMMISSION_LEVELS, TOTAL_POSITIONS } from "@/lib/offers";
import { PERSONAL_SPONSOR_TARGET } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/network")({
  component: AdminNetwork,
});

function AdminNetwork() {
  const { data } = useAsync(() => api.admin.users(), []);
  const members = data?.members ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Progress"
        title="Network & qualification"
        description={`Personal sponsors required: ${PERSONAL_SPONSOR_TARGET}. Level 5 is ${COMMISSION_LEVELS[4].positions} positions; ${TOTAL_POSITIONS} is the five-level total. Each member sees their own detailed level breakdown under Network.`}
      />

      <Surface className="p-0 sm:p-0">
        {members.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No members to inspect.</p>
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted">{m.referral_code}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={m.activation_status} />
                  <StatusBadge status={m.role} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
