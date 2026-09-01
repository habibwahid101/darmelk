import { createFileRoute } from "@tanstack/react-router";
import { GitFork } from "lucide-react";
import { EmptyState, PageHeader, StatCard, Surface } from "@/components/states";
import { useMemberSession } from "@/components/layout/use-member";
import { COMMISSION_LEVELS, TOTAL_POSITIONS } from "@/lib/offers";
import { PERSONAL_SPONSOR_TARGET } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/network")({ component: NetworkPage });

function NetworkPage() {
  const { member } = useMemberSession();
  const { data } = useAsync(() => api.myNetwork(), [member?.user_id], { enabled: Boolean(member) });
  if (!member) return null;

  const directs = data?.directs ?? [];
  const counts = data?.levelCounts ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const filled = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Network"
        title="Your Network"
        description="Review personal sponsors, confirmed members, and progress through five levels."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Personal Sponsors"
          value={`${directs.length} / ${PERSONAL_SPONSOR_TARGET}`}
          hint="Eligible after the referred member’s booking is confirmed."
        />
        <StatCard
          label="Confirmed Members"
          value={`${filled} / ${TOTAL_POSITIONS}`}
          hint={`${TOTAL_POSITIONS} is the total across five levels, not Level 5.`}
        />
        <StatCard
          label="Your referral code"
          value={member.referral_code}
          hint="Share this code. Cross-offer sponsorship is supported."
          compact
        />
      </div>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Level Progress</h2>
        <ul className="mt-4 space-y-3">
          {COMMISSION_LEVELS.map((level) => {
            const filledAt = counts[level.level as 1 | 2 | 3 | 4 | 5] ?? 0;
            const pct = Math.min(100, Math.round((filledAt / level.positions) * 100));
            return (
              <li key={level.level}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">
                    Level {level.level}
                    {level.level === 5 ? " · 243 bookings" : ""}
                  </span>
                  <span className="tabular-nums text-muted">
                    {filledAt} / {level.positions}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist">
                  <div className="h-full rounded-full bg-pine" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </Surface>

      {directs.length === 0 ? (
        <EmptyState
          icon={GitFork}
          title="No network members yet"
          description="Direct sponsors appear here after someone uses your referral code and their booking is confirmed."
        />
      ) : (
        <Surface>
          <h2 className="font-display text-xl font-semibold">Personal Sponsors</h2>
          <ul className="mt-4 divide-y divide-line">
            {directs.map((d) => (
              <li key={d.user_id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  <p className="text-xs capitalize text-muted">{d.activation_status}</p>
                </div>
                <p className="text-xs text-muted">{d.referral_code}</p>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
