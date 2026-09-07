import { createFileRoute, Link } from "@tanstack/react-router";
import { Award } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { monthRangeLabel, tierLabel } from "@/lib/leadership";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/leadership-rewards/")({
  component: AdminLeadershipRewards,
});

function AdminLeadershipRewards() {
  const { data, loading } = useAsync(() => api.admin.leadershipRewards(), []);
  const rows = data?.rewards ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Finance"
        title="Leadership Rewards"
        description="Audit 12-month Leadership Reward rounds. Historical monthly amounts cannot be overwritten from this screen."
      />
      {loading && !data ? (
        <p className="text-sm text-muted">Loading Leadership Rewards…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No Leadership Reward rounds yet"
          description="A round appears after a member legitimately completes Level 5 and the following calendar month is established."
        />
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <li key={row.cycleId} className="min-w-0 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="truncate text-sm text-muted">{row.email}</p>
                  </div>
                  <StatusBadge status={row.phase === "active" ? "in-progress" : row.phase} />
                </div>
                <p className="mt-3 text-sm">{monthRangeLabel(row.startMonth, row.endMonth)}</p>
                <p className="mt-1 text-sm text-muted">
                  {tierLabel(row.currentTier)} · {formatBdt(row.totalEarned)} earned
                </p>
                <Button asChild size="sm" variant="secondary" className="mt-4">
                  <Link to="/admin/leadership-rewards/$userId" params={{ userId: row.userId }}>
                    View audit
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
          <Surface className="hidden overflow-x-auto p-0 sm:p-0 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
                <tr>
                  {["Member", "Round", "Month", "Tier", "Earned", "Status", ""].map((h) => (
                    <th key={h || "actions"} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.cycleId} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{monthRangeLabel(row.startMonth, row.endMonth)}</td>
                    <td className="px-4 py-3 tabular-nums">{row.currentMonthNumber ? `${row.currentMonthNumber} / 12` : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{tierLabel(row.currentTier)}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatBdt(row.totalEarned)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.phase === "active" ? "in-progress" : row.phase} />
                    </td>
                    <td className="px-4 py-3">
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/admin/leadership-rewards/$userId" params={{ userId: row.userId }}>
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        </>
      )}
    </div>
  );
}
