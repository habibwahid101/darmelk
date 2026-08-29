import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers });

function AdminUsers() {
  const { data } = useAsync(() => api.admin.users(), []);
  const members = data?.members ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Members"
        title="Users"
        description="Records created when someone signs in on this environment. No dummy members."
      />
      {members.length === 0 ? (
        <EmptyState icon={Users} title="No members" description="Users appear after they create an account." />
      ) : (
        <Surface className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.user_id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <p className="font-medium">{m.name}</p>
                  <StatusBadge status={m.role} />
                  <StatusBadge status={m.activation_status} />
                </div>
                <p className="text-sm text-muted">{m.email || "No email"}</p>
                <p className="text-xs text-subtle">
                  Code {m.referral_code} · Sponsor {m.sponsor_user_id ? "assigned" : "none"}
                </p>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
