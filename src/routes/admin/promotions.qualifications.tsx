import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/promotions/qualifications")({
  component: AdminPromotionQualifications,
});

function AdminPromotionQualifications() {
  const { data, loading } = useAsync(() => api.admin.promotionQualifications(), []);
  const rows = data?.qualifications ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Promotion Management"
        title="Qualified members"
        description="Qualification is created only from an existing confirmed booking inside the campaign window. There is no unaudited override that marks a member qualified."
      />
      {loading && !data ? (
        <p className="text-sm text-muted">Loading qualifications…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="No qualifications yet" description="Members appear here after a confirmed booking on an eligible property during an active campaign." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{row.user_name ?? "Member"}</p>
                  <p className="break-all text-xs text-subtle">{row.user_id}</p>
                  <p className="mt-2 text-sm">{row.promotion_title}</p>
                  <p className="mt-1 break-all text-sm text-muted">
                    {row.offer_title} · {row.booking_id}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Booking confirmed {formatWhen(row.booking_confirmed_at)} · Qualified {formatWhen(row.qualified_at)}
                  </p>
                </div>
                <StatusBadge status="qualified" />
              </div>
              <ul className="mt-4 flex flex-wrap gap-2">
                {(row.fulfillments ?? []).map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-full bg-paper px-3 py-1 text-xs">
                    <span className="max-w-[10rem] truncate">{f.reward_name}</span>
                    <StatusBadge status={f.status} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
