import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { COMMISSION_LEVELS, FLAGSHIP, formatBdt, TOTAL_POSITIONS } from "@/lib/offers";
import {
  getLevelCounts,
  isQualified,
  ownQualificationOffer,
  PERSONAL_SPONSOR_TARGET,
  usePlatform,
} from "@/lib/platform";

export const Route = createFileRoute("/app/qualification")({
  component: QualificationPage,
});

function QualificationPage() {
  const { member } = useMemberSession();
  const members = usePlatform((s) => s.members);
  const bookings = usePlatform((s) => s.bookings);
  if (!member) return null;

  const counts = getLevelCounts(members, bookings, member.userId);
  const qualified = isQualified(members, bookings, member.userId);
  const own = ownQualificationOffer(bookings, member.userId);
  const l5 = COMMISSION_LEVELS[4];
  const remainingDirects = Math.max(0, PERSONAL_SPONSOR_TARGET - (counts[1] ?? 0));
  const remainingL5 = Math.max(0, l5.positions - (counts[5] ?? 0));

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Qualification"
        title="Qualification status"
        description="Personally sponsor 3 eligible members and complete Level 5. The benefit comes from your own booked offer."
        action={<StatusBadge status={qualified ? "qualified" : "not-qualified"} />}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Personal sponsors"
          value={`${counts[1] ?? 0} / ${PERSONAL_SPONSOR_TARGET}`}
          hint={remainingDirects ? `${remainingDirects} remaining` : "Requirement met"}
        />
        <StatCard
          label="Level 5"
          value={`${counts[5] ?? 0} / ${l5.positions}`}
          hint={`Level 5 is ${l5.positions} positions. ${TOTAL_POSITIONS} is the five-level total.`}
        />
      </div>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Attached benefit</h2>
        {own ? (
          <>
            <p className="mt-2 font-medium">{own.offerTitle}</p>
            <p className="mt-1 whitespace-nowrap font-display text-3xl font-semibold tabular-nums">
              {formatBdt(own.qualificationBenefit)}
            </p>
            <p className="mt-2 text-sm text-muted">
              This amount belongs to the offer you booked. It is not a universal Property Gateway figure.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Book an offer to attach a qualification benefit. Until then there is no benefit amount to display.
            </p>
            <Button asChild className="mt-4">
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                View a published offer
              </Link>
            </Button>
          </>
        )}
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Remaining</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>Direct sponsors remaining: {remainingDirects}</li>
          <li>Level 5 positions remaining: {remainingL5}</li>
          <li>
            {qualified
              ? "Both requirements are complete. Benefit stays tied to your booked offer."
              : "Both requirements must be complete before qualification is unlocked."}
          </li>
        </ul>
      </Surface>
    </div>
  );
}
