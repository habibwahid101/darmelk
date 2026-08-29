import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertBanner, EmptyState, PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { FLAGSHIP, formatBdt, COMMISSION_LEVELS, TOTAL_POSITIONS } from "@/lib/offers";
import { PERSONAL_SPONSOR_TARGET } from "@/lib/platform";
import { api, type Booking } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatWhen } from "@/lib/platform";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/app/")({ component: OverviewPage });

const ACTIVATION_FEE = 1000;

function primaryBooking(bookings: Booking[]): Booking | undefined {
  return (
    bookings.find((b) => b.status === "activated") ||
    bookings.find((b) => b.status === "confirmed") ||
    bookings.find((b) => b.status === "pending") ||
    bookings[0]
  );
}

function OverviewPage() {
  const { user, member } = useMemberSession();
  const { data: bookingsData } = useAsync(() => api.myBookings(), [member?.user_id], { enabled: Boolean(member) });
  const { data: qual } = useAsync(() => api.myQualification(), [member?.user_id], { enabled: Boolean(member) });
  const { data: network } = useAsync(() => api.myNetwork(), [member?.user_id], { enabled: Boolean(member) });
  const { data: commissions } = useAsync(() => api.myCommissions(), [member?.user_id], { enabled: Boolean(member) });
  const { data: txData } = useAsync(() => api.myTransactions(), [member?.user_id], { enabled: Boolean(member) });

  if (!member) return null;

  const bookings = bookingsData?.bookings ?? [];
  const booking = primaryBooking(bookings);
  const counts = network?.levelCounts ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const filled = Object.values(counts).reduce((a, b) => a + b, 0);
  const qualified = qual?.qualified ?? false;
  const wallet = commissions?.totals ?? { available: 0, pending: 0, paid: 0, reversed: 0, rejected: 0 };
  const recent = (txData?.transactions ?? []).slice(0, 4);
  const firstName = (user?.displayName ?? "Member").split(" ")[0];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Overview"
        title={`Hello, ${firstName}`}
        description="Property first. Booking, commission, and qualification benefit stay separate."
      />

      <AlertBanner
        tone={member.activation_status === "active" ? "ok" : member.activation_status === "pending" ? "warn" : "neutral"}
        title={`Activation: ${member.activation_status}`}
      >
        {member.activation_status === "active" ? (
          <span>Active until {formatWhen(member.activation_expires_at)}.</span>
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
            src={booking.image ?? FLAGSHIP.image}
            alt=""
            className="aspect-[16/11] w-full rounded-xl object-cover md:h-24 md:w-36 md:aspect-auto"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Current booked property</p>
            <p className="mt-1 font-display text-2xl font-semibold">{booking.offer_title}</p>
            <p className="mt-1 text-sm text-muted">
              Booking {formatBdt(booking.booking_amount)} · Benefit {formatBdt(booking.qualification_benefit)}{" "}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Qualification"
          value={qualified ? "Qualified" : "Not qualified"}
          hint="Requires 3 personal eligible sponsors and a complete Level 5."
        />
        <StatCard
          label="Direct sponsors"
          value={`${qual?.sponsorCount ?? 0} / ${PERSONAL_SPONSOR_TARGET}`}
          hint="Counted after the referred member's booking is confirmed and they are activated."
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

      {booking ? (
        <Surface>
          <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Next action</p>
          <NextAction bookingStatus={booking.status} bookingId={booking.id} />
        </Surface>
      ) : null}

      <div>
        <h2 className="font-display text-xl font-semibold">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No activity yet. Bookings and commission appear here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)]">
            {recent.map((t) => (
              <li key={`${t.type}-${t.id}`} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium capitalize">{t.type}</p>
                  <p className="text-xs text-muted">{t.reference}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatBdt(t.amount)}</p>
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

function NextAction({ bookingStatus, bookingId }: { bookingStatus: string; bookingId: string }) {
  if (bookingStatus === "pending") {
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
