import { createFileRoute, Link } from "@tanstack/react-router";
import { Award } from "lucide-react";
import { EmptyState, PageHeader, StatCard, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { LEVEL5_CAPACITY, monthLabel, monthRangeLabel, tierLabel } from "@/lib/leadership";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/leadership-reward")({
  component: LeadershipRewardPage,
});

function LeadershipRewardPage() {
  const { member } = useMemberSession();
  const { data, loading } = useAsync(() => api.myLeadershipReward(), [member?.user_id], {
    enabled: Boolean(member),
  });
  if (!member) return null;

  const leadership = data?.leadership;
  const qualification = leadership?.qualification;
  const cycle = leadership?.cycle;

  if (loading && !leadership) {
    return <p className="text-sm text-muted">Loading Leadership Reward…</p>;
  }

  if (!leadership?.eligible || !cycle) {
    const filled = qualification?.levelCounts[5] ?? 0;
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Leadership Reward"
          title="Leadership Reward"
          description="A separate monthly reward round that begins only after legitimate Level 5 completion."
        />
        <Surface>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Pre-eligibility</p>
          <h2 className="mt-3 font-display text-2xl font-semibold">Complete Level 5 to become eligible</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Complete Level 5 to become eligible for the Leadership Reward round. The first reward month is the calendar
            month after Level 5 is completed. Commission, qualification benefit, and this reward stay separate.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StatCard label="Level 5 progress" value={`${filled} / ${LEVEL5_CAPACITY}`} hint="Existing network positions with activated bookings" />
            <StatCard
              label="Personal sponsors"
              value={`${qualification?.sponsorCount ?? 0} / ${qualification?.sponsorTarget ?? 3}`}
              hint="Shown from current qualification records"
            />
          </div>
          <Button asChild className="mt-6">
            <Link to="/app/qualification">View qualification progress</Link>
          </Button>
        </Surface>
      </div>
    );
  }

  const history = [...leadership.entitlements, ...leadership.projected];
  const phaseStatus = cycle.phase === "completed" ? "completed" : cycle.phase === "upcoming" ? "upcoming" : "in-progress";

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leadership Reward"
        title="Leadership Reward"
        description="Monthly entitlement from your original 12-month round. Later upgrades never rewrite earlier months."
        action={<StatusBadge status={phaseStatus} />}
      />

      {cycle.phase === "completed" ? (
        <Surface>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Round completed</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">This 12-month round has ended</h2>
          <p className="mt-2 text-sm text-muted">
            {monthRangeLabel(cycle.startMonth, cycle.endMonth)}. No Month 13 is created from this round.
          </p>
        </Surface>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Current tier" value={tierLabel(cycle.currentTier)} hint={cycle.phase === "completed" ? "Final tier reached" : "Effective for the current calendar month"} />
        <StatCard label="Reward round" value={monthRangeLabel(cycle.startMonth, cycle.endMonth)} hint="Fixed 12 consecutive months" />
        <StatCard
          label="Current progress"
          value={cycle.currentMonthNumber ? `Month ${cycle.currentMonthNumber} of 12` : cycle.phase === "upcoming" ? "Starts next" : "Round completed"}
          hint={`${cycle.monthsCompleted} month${cycle.monthsCompleted === 1 ? "" : "s"} recorded`}
        />
        <StatCard label="Total earned" value={formatBdt(cycle.totalEarned)} hint="Sum of materialized monthly entitlements" />
      </div>

      <Surface>
        {cycle.phase === "completed" ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Final tier reached</p>
            <h2 className="mt-2 font-display text-2xl font-semibold">{tierLabel(cycle.finalTier)}</h2>
            <p className="mt-3 text-sm text-muted">This round is closed. Historical monthly entitlements stay as recorded.</p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Next tier</p>
            {cycle.nextTier ? (
              <>
                <h2 className="mt-2 font-display text-2xl font-semibold">{tierLabel(cycle.nextTier)}</h2>
                <p className="mt-3 text-sm text-muted">
                  {cycle.nextTierProgress.count} of {cycle.nextTierProgress.target} personally sponsored members qualified
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-mist">
                  <div
                    className="h-full rounded-full bg-pine"
                    style={{ width: `${Math.min(100, (cycle.nextTierProgress.count / cycle.nextTierProgress.target) * 100)}%` }}
                  />
                </div>
                {cycle.nextRequirement ? <p className="mt-4 text-sm text-muted">{cycle.nextRequirement}</p> : null}
              </>
            ) : (
              <>
                <h2 className="mt-2 font-display text-2xl font-semibold">{tierLabel(cycle.finalTier)}</h2>
                <p className="mt-3 text-sm text-muted">Highest Leadership Reward tier in this round has been reached.</p>
              </>
            )}
          </>
        )}
      </Surface>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Cycle start" value={monthLabel(cycle.startMonth)} />
        <StatCard label="Cycle end" value={monthLabel(cycle.endMonth)} />
        <StatCard label="Remaining" value={`${cycle.monthsRemaining} month${cycle.monthsRemaining === 1 ? "" : "s"}`} />
      </div>

      <Surface className="overflow-hidden p-0 sm:p-0">
        <div className="px-5 py-4">
          <h2 className="font-display text-xl font-semibold">Monthly reward history</h2>
          <p className="mt-1 text-sm text-muted">Earned months are stored. Upcoming months are shown only as a projection.</p>
        </div>
        {history.length === 0 ? (
          <EmptyState icon={Award} title="No months yet" description="The first entitlement is recorded when the reward round reaches its first calendar month." />
        ) : (
          <ul className="divide-y divide-line md:hidden">
            {history.map((row) => (
              <li key={`${row.status}-${row.rewardMonth}`} className="flex min-w-0 items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium">{monthLabel(row.rewardMonth)}</p>
                  <p className="text-sm text-muted">Month {row.cycleMonth} · {tierLabel(row.tier)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="whitespace-nowrap tabular-nums">{formatBdt(row.amount)}</p>
                  <StatusBadge status={row.status} className="mt-1" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {history.length ? (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-subtle">
                <tr className="border-y border-line">
                  {["Month", "Cycle month", "Tier", "Amount", "Status"].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={`${row.status}-${row.rewardMonth}`} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">{monthLabel(row.rewardMonth)}</td>
                    <td className="px-5 py-3 tabular-nums">{row.cycleMonth}</td>
                    <td className="px-5 py-3">{tierLabel(row.tier)}</td>
                    <td className="px-5 py-3 whitespace-nowrap tabular-nums">{formatBdt(row.amount)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
