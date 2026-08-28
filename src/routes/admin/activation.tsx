import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBdt } from "@/lib/offers";
import { ACTIVATION_FEE, formatWhen, usePlatform, type ActivationStatus } from "@/lib/platform";

export const Route = createFileRoute("/admin/activation")({
  component: AdminActivation,
});

function AdminActivation() {
  const members = usePlatform((s) => s.members);
  const adminSetActivation = usePlatform((s) => s.adminSetActivation);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Activation"
        title="Annual activation"
        description={`Fee ${formatBdt(ACTIVATION_FEE)}. Separate from property booking and commission.`}
      />
      {members.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="No members" description="Activation records appear with member accounts." />
      ) : (
        <Surface className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.userId} className="space-y-3 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-muted">Expires {formatWhen(m.activationExpiresAt)}</p>
                  </div>
                  <StatusBadge status={m.activationStatus} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["inactive", "pending", "active", "expired"] as ActivationStatus[]).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={m.activationStatus === status ? "primary" : "secondary"}
                      onClick={() => adminSetActivation(m.userId, status)}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
