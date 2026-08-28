import { createFileRoute } from "@tanstack/react-router";
import { GitFork } from "lucide-react";
import { EmptyState, PageHeader, StatCard, Surface } from "@/components/states";
import { useMemberSession } from "@/components/layout/use-member";
import { COMMISSION_LEVELS, TOTAL_POSITIONS } from "@/lib/offers";
import {
  getDirects,
  getLevelCounts,
  memberById,
  networkFilled,
  PERSONAL_SPONSOR_TARGET,
  usePlatform,
} from "@/lib/platform";

export const Route = createFileRoute("/app/network")({ component: NetworkPage });

function NetworkPage() {
  const { member } = useMemberSession();
  const members = usePlatform((s) => s.members);
  const bookings = usePlatform((s) => s.bookings);
  if (!member) return null;

  const directs = getDirects(members, bookings, member.userId);
  const counts = getLevelCounts(members, bookings, member.userId);
  const filled = networkFilled(counts);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Network"
        title="3×5 progress"
        description={`Personally sponsor ${PERSONAL_SPONSOR_TARGET}. Structure: L1 ${COMMISSION_LEVELS[0].positions} · L2 ${COMMISSION_LEVELS[1].positions} · L3 ${COMMISSION_LEVELS[2].positions} · L4 ${COMMISSION_LEVELS[3].positions} · L5 ${COMMISSION_LEVELS[4].positions}. Total positions ${TOTAL_POSITIONS}.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Direct sponsors"
          value={`${directs.length} / ${PERSONAL_SPONSOR_TARGET}`}
          hint="Eligible after the referred member’s booking is confirmed."
        />
        <StatCard
          label="Filled positions"
          value={`${filled} / ${TOTAL_POSITIONS}`}
          hint={`${TOTAL_POSITIONS} is the total across five levels, not Level 5.`}
        />
        <StatCard
          label="Your referral code"
          value={member.referralCode}
          hint="Share this code. Cross-offer sponsorship is supported."
          compact
        />
      </div>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Level summary</h2>
        <ul className="mt-4 space-y-3">
          {COMMISSION_LEVELS.map((level) => {
            const filledAt = counts[level.level] ?? 0;
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
          <h2 className="font-display text-xl font-semibold">Direct sponsors</h2>
          <ul className="mt-4 divide-y divide-line">
            {directs.map((d) => (
              <li key={d.userId} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted">
                    Sponsor {memberById(members, d.sponsorUserId)?.name ?? "—"}
                  </p>
                </div>
                <p className="text-xs text-muted">{d.referralCode}</p>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
