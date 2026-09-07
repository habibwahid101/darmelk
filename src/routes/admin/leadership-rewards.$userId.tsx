import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { monthLabel, monthRangeLabel, tierLabel } from "@/lib/leadership";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/leadership-rewards/$userId")({
  component: AdminLeadershipDetail,
});

function AdminLeadershipDetail() {
  const { userId } = Route.useParams();
  const { data, loading, error } = useAsync(() => api.admin.leadershipReward(userId), [userId]);
  const leadership = data?.leadership;
  const cycle = leadership?.cycle;

  if (loading && !data) return <p className="text-sm text-muted">Loading member Leadership Reward…</p>;
  if (error || !data) return <p className="text-sm text-clay">{error?.message ?? "Member not found."}</p>;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leadership Rewards"
        title={data.member.name}
        description={`${data.member.email} · ${data.member.referral_code}. Read-only audit view — historical amounts stay as recorded.`}
        action={
          <Button asChild size="sm" variant="secondary">
            <Link to="/admin/leadership-rewards">All rounds</Link>
          </Button>
        }
      />

      {!leadership?.eligible || !cycle ? (
        <Surface>
          <p className="font-display text-xl font-semibold">Not yet in a Leadership Reward round</p>
          <p className="mt-2 text-sm text-muted">
            Level 5 progress {leadership?.qualification.levelCounts[5] ?? 0} / 243. A round is created only after Level 5
            completion, starting the following calendar month.
          </p>
        </Surface>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={cycle.phase === "active" ? "in-progress" : cycle.phase} />
            {cycle.currentTier ? <StatusBadge status="earned" /> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Current tier" value={tierLabel(cycle.currentTier)} />
            <StatCard label="Reward round" value={monthRangeLabel(cycle.startMonth, cycle.endMonth)} />
            <StatCard
              label="Cycle month"
              value={cycle.currentMonthNumber ? `${cycle.currentMonthNumber} / 12` : cycle.phase}
            />
            <StatCard label="Total earned" value={formatBdt(cycle.totalEarned)} />
          </div>
          <Surface>
            <h2 className="font-display text-xl font-semibold">Next-tier progress</h2>
            {cycle.nextTier ? (
              <p className="mt-3 text-sm text-muted">
                {tierLabel(cycle.nextTier)} · {cycle.nextTierProgress.count} / {cycle.nextTierProgress.target} personally
                sponsored members qualified.
                {cycle.nextRequirement ? ` ${cycle.nextRequirement}` : ""}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">Highest tier in this round has been reached.</p>
            )}
          </Surface>
          <EvidenceList title="BDT 50,000 evidence" rows={leadership.evidence.tier50} />
          <EvidenceList title="BDT 100,000 evidence" rows={leadership.evidence.tier100} />
          {leadership.tierEvents?.length ? (
            <Surface>
              <h2 className="font-display text-xl font-semibold">Historical tiers</h2>
              <p className="mt-1 text-sm text-muted">
                Tier upgrades are recorded when the condition is met. They never rewrite earlier months.
              </p>
              <ul className="mt-4 divide-y divide-line">
                {leadership.tierEvents.map((event) => (
                  <li key={event.tier} className="flex min-w-0 flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between">
                    <span className="font-medium">{tierLabel(event.tier)}</span>
                    <span className="text-muted">
                      Effective {monthLabel(event.effectiveMonth)} · {event.appliesInCycle ? "applies in this round" : "outside this round"}
                    </span>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}
          <Surface className="overflow-hidden p-0 sm:p-0">
            <div className="px-5 py-4">
              <h2 className="font-display text-xl font-semibold">Monthly entitlements</h2>
              <p className="mt-1 text-sm text-muted">Append-only. There is no raw balance overwrite on this page.</p>
            </div>
            <ul className="divide-y divide-line">
              {leadership.entitlements.map((row) => (
                <li key={row.id} className="flex min-w-0 flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {monthLabel(row.rewardMonth)} · Month {row.cycleMonth}
                    </p>
                    <p className="text-sm text-muted">{tierLabel(row.tier)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="whitespace-nowrap tabular-nums">{formatBdt(row.amount)}</p>
                    <StatusBadge status={row.status} />
                  </div>
                </li>
              ))}
            </ul>
          </Surface>
        </>
      )}
    </div>
  );
}

function EvidenceList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ user_id: string; eligible_at: string; name?: string; email?: string }>;
}) {
  return (
    <Surface>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No qualifying personally sponsored members recorded yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {rows.map((row) => (
            <li key={row.user_id} className="flex min-w-0 flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between">
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.name || row.user_id}</span>
                {row.email ? <span className="block truncate text-muted">{row.email}</span> : null}
              </span>
              <span className="shrink-0 text-muted">{new Date(row.eligible_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
