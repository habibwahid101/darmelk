import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertBanner, EmptyState, PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { FLAGSHIP, formatBdt, COMMISSION_LEVELS, TOTAL_POSITIONS } from "@/lib/offers";
import {
  ACTIVATION_FEE,
  commissionTotals,
  formatWhen,
  getLevelCounts,
  isQualified,
  networkFilled,
  PERSONAL_SPONSOR_TARGET,
  primaryBooking,
  usePlatform,
} from "@/lib/platform";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/app/")({ component: OverviewPage });

function OverviewPage() {
  const { member } = useMemberSession();
  const bookings = usePlatform((s) => s.bookings);
  const commissions = usePlatform((s) => s.commissions);
  const members = usePlatform((s) => s.members);
  const transactions = usePlatform((s) => s.transactions);
  if (!member) return null;

  const booking = primaryBooking(bookings, member.userId);
  const counts = getLevelCounts(members, bookings, member.userId);
  const filled = networkFilled(counts);
  const qualified = isQualified(members, bookings, member.userId);
  const wallet = commissionTotals(commissions, member.userId);
  const recent = transactions.filter((t) => t.userId === member.userId).slice(0, 4);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Overview"
        title={`Hello, ${member.name.split(" ")[0]}`}
        description="Property first. Booking, commission, and qualification benefit stay separate."
      />

      <AlertBanner
        tone={
          member.activationStatus === "active"
            ? "ok"
            : member.activationStatus === "pending"
              ? "warn"
              : "neutral"
        }
        title={`Activation: ${member.activationStatus}`}
      >
        {member.activationStatus === "active" ? (
          <span>Active until {formatWhen(member.activationExpiresAt)}.</span>
        ) : (
          <span>
            Annual activation is {formatBdt(ACTIVATION_FEE)} and is not a property purchase.{" "}
            <Link to="/app/activation" className="font-medium text-pine hover:underline">
              View status
            </Link>
          </span>
        )}
      </AlertBanner>

      {booking ? (
        <Surface className="grid gap-5 md:grid-cols-[9rem_1fr_auto] md:items-center">
          <img
            src={booking.image}
            alt=""
            className="aspect-[16/11] w-full rounded-xl object-cover md:h-24 md:w-36 md:aspect-auto"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              Current booked property
            </p>
            <p className="mt-1 font-display text-2xl font-semibold">{booking.offerTitle}</p>
            <p className="mt-1 text-sm text-muted">
              Booking {formatBdt(booking.bookingAmount)} · Benefit {formatBdt(booking.qualificationBenefit)}{" "}
              <span className="text-subtle">(this offer only)</span>
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <StatusBadge status={booking.status} />
            <Button asChild size="sm" variant="secondary">
              <Link to="/app/bookings/$id" params={{ id: booking.id }}>
                Details
              </Link>
            </Button>
          </div>
        </Surface>
      ) : (
        <EmptyState
          icon={Building2}
          title="No bookings yet"
          description="Start with a published offer. Retail value, booking amount, and qualification benefit are shown before you commit."
          action={
            <Button asChild>
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                View flagship offer
              </Link>
            </Button>
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Qualification"
          value={qualified ? "Qualified" : "Not qualified"}
          hint="Requires 3 personal eligible sponsors and a complete Level 5."
        />
        <StatCard
          label="Direct sponsors"
          value={`${counts[1] ?? 0} / ${PERSONAL_SPONSOR_TARGET}`}
          hint="Counted after the referred member’s booking is confirmed."
        />
        <StatCard
          label="Network filled"
          value={`${filled} / ${TOTAL_POSITIONS}`}
          hint={`${TOTAL_POSITIONS} is the total of all five levels — not Level 5.`}
        />
        <StatCard
          label="Commission"
          value={formatBdt(wallet.available)}
          hint={`Pending ${formatBdt(wallet.pending)} · from actual confirmed booking amounts.`}
        />
      </div>

      <Surface>
        <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Next action</p>
        <NextAction bookingStatus={booking?.status} bookingId={booking?.id} />
      </Surface>

      <div>
        <h2 className="font-display text-xl font-semibold">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No activity yet. Bookings and commission appear here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)]">
            {recent.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium capitalize">{t.type}</p>
                  <p className="text-xs text-muted">{t.reference}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold tabular-nums">{formatBdt(t.amount)}</p>
                  <StatusBadge status={t.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NextAction({
  bookingStatus,
  bookingId,
}: {
  bookingStatus?: string;
  bookingId?: string;
}) {
  if (!bookingStatus) {
    return (
      <>
        <p className="mt-2 font-display text-2xl font-semibold">Book a published offer</p>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Your qualification benefit is attached to the offer you book.
        </p>
        <Button asChild className="mt-4">
          <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
            View flagship offer
          </Link>
        </Button>
      </>
    );
  }
  if (bookingStatus === "pending" && bookingId) {
    return (
      <>
        <p className="mt-2 font-display text-2xl font-semibold">Booking pending confirmation</p>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Operations will review this booking request. No payment is taken in this step.
        </p>
        <Button asChild className="mt-4">
          <Link to="/app/bookings/$id" params={{ id: bookingId }}>
            View booking
          </Link>
        </Button>
      </>
    );
  }
  return (
    <>
      <p className="mt-2 font-display text-2xl font-semibold">Build 3×5 progress</p>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Personally sponsor {PERSONAL_SPONSOR_TARGET}, then complete five levels. Level 5 is{" "}
        {COMMISSION_LEVELS[4].positions} of {TOTAL_POSITIONS} total positions.
      </p>
      <Button asChild className="mt-4">
        <Link to="/app/network">Open network</Link>
      </Button>
    </>
  );
}
