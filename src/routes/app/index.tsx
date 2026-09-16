import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { LoadingState, PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { DashboardPromotions } from "@/components/promotions/dashboard-promotions";
import { FLAGSHIP, formatBdt } from "@/lib/offers";
import { api, type Booking } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatWhen } from "@/lib/platform";
import { isGrowthParticipant } from "@/lib/growth";

export const Route = createFileRoute("/app/")({ component: OverviewPage });
const primary = (rows: Booking[]) =>
  rows.find((b) => b.status === "activated") ||
  rows.find((b) => b.status === "confirmed") ||
  rows.find((b) => b.status === "pending");

function OverviewPage() {
  const { user, member } = useMemberSession();
  const { data: bookings, loading: bookingsLoading } = useAsync(() => api.myBookings(), [member?.user_id], { enabled: Boolean(member) });
  const { data: payments } = useAsync(() => api.myPayments(), [member?.user_id], { enabled: Boolean(member) });
  const { data: qual } = useAsync(() => api.myQualification(), [member?.user_id], { enabled: Boolean(member) && isGrowthParticipant(member) });
  const { data: comm } = useAsync(() => api.myCommissions(), [member?.user_id], { enabled: Boolean(member) && isGrowthParticipant(member) });
  const { data: tx } = useAsync(() => api.myTransactions(), [member?.user_id], { enabled: Boolean(member) });
  if (!member) return null;
  if (bookingsLoading && !bookings) return <LoadingState label="Loading overview…" />;
  const booking = primary(bookings?.bookings ?? []);
  const active = member.activation_status === "active";
  const activationPayment = (payments?.payments ?? []).find((p) => p.target_type === "activation");
  const first = (user?.displayName ?? "Member").split(" ")[0];
  const inGrowth = isGrowthParticipant(member);

  if (!inGrowth) {
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Overview"
          title={`Hello, ${first}`}
          description="Your Darmelk account. Browse properties, or join the Growth Program when you are ready."
        />
        <DashboardPromotions userId={member.user_id} />
        <Surface className="grid gap-5 md:grid-cols-[9rem_1fr_auto] md:items-center">
          <img src={FLAGSHIP.image} alt={FLAGSHIP.title} className="aspect-[4/3] w-full rounded-xl object-cover md:h-24 md:w-36" />
          <div>
            <p className="text-xs uppercase tracking-wide text-subtle">Explore properties</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{FLAGSHIP.title}</h2>
            <p className="mt-1 text-sm text-muted">Initial booking {formatBdt(FLAGSHIP.bookingAmount)}</p>
          </div>
          <Button asChild>
            <Link to="/properties">Browse properties</Link>
          </Button>
        </Surface>
        <Surface>
          <p className="text-xs font-medium uppercase tracking-[.16em] text-pine">Optional</p>
          <h2 className="mt-3 font-display text-3xl font-semibold">Growth Program</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            The Growth Program is optional. A valid Referral ID is required to join. Network, qualification, commission, and leadership remain in that program.
          </p>
          <Button asChild className="mt-6">
            <Link to="/growth-program">Join Growth Program</Link>
          </Button>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader kicker="Overview" title={`Hello, ${first}`} description="Your property, progress, and financial activity in one place." />
      <DashboardPromotions userId={member.user_id} />
      {!active ? (
        <Surface className="border border-clay/20">
          <p className="text-xs font-medium uppercase tracking-[.16em] text-clay">Growth Program</p>
          <h2 className="mt-3 font-display text-3xl font-semibold">Growth Program Activation</h2>
          <p className="mt-2 font-display text-2xl">
            BDT 1,000 <span className="font-sans text-sm text-muted">/ year</span>
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <StatusBadge status={member.activation_status} />
            {activationPayment ? <StatusBadge status={activationPayment.status} /> : null}
          </div>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Growth booking, sponsoring, earning, and withdrawal privileges unlock only after payment review and approval. Your Darmelk account stays free.
          </p>
          <Button asChild className="mt-6">
            <Link to="/app/activation">Continue Growth Program Activation</Link>
          </Button>
        </Surface>
      ) : !booking ? (
        <>
          <Surface>
            <p className="text-xs font-medium uppercase tracking-[.16em] text-pine">Growth Program</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">Growth Program Active</h2>
            <p className="mt-2 text-sm text-muted">Active until {formatWhen(member.activation_expires_at)}.</p>
          </Surface>
          <Surface className="grid gap-5 md:grid-cols-[9rem_1fr_auto] md:items-center">
            <img src={FLAGSHIP.image} alt={FLAGSHIP.title} className="aspect-[4/3] w-full rounded-xl object-cover md:h-24 md:w-36" />
            <div>
              <p className="text-xs uppercase tracking-wide text-subtle">Choose your property</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{FLAGSHIP.title}</h2>
              <p className="mt-1 text-sm text-muted">Initial booking {formatBdt(FLAGSHIP.bookingAmount)}</p>
            </div>
            <Button asChild>
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                View Property
              </Link>
            </Button>
          </Surface>
          <Eligibility ownBooking={false} />
        </>
      ) : (
        <>
          <Surface className="grid gap-5 md:grid-cols-[9rem_1fr_auto] md:items-center">
            <img src={booking.image ?? FLAGSHIP.image} alt="" className="aspect-[4/3] w-full rounded-xl object-cover md:h-24 md:w-36" />
            <div>
              <p className="text-xs uppercase tracking-wide text-subtle">Your property</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{booking.offer_title}</h2>
              <p className="mt-1 text-sm text-muted">
                Booking {formatBdt(booking.booking_amount)} · Property value {formatBdt(booking.retail_value)} · Benefit {formatBdt(booking.qualification_benefit)}
              </p>
            </div>
            <StatusBadge status={booking.status} />
          </Surface>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Qualification Progress" value={qual?.qualified ? "Qualified" : "In Progress"} hint={`${qual?.sponsorCount ?? 0} / 3 personal sponsors`} />
            <StatCard label="Available Commission" value={formatBdt(comm?.totals.available ?? 0)} hint={`Pending ${formatBdt(comm?.totals.pending ?? 0)}`} />
            <StatCard label="Booking Status" value={booking.status} hint="Payment and booking history remain recorded." />
          </div>
          <Eligibility ownBooking={booking.status === "confirmed" || booking.status === "activated"} />
          <Recent rows={(tx?.transactions ?? []).slice(0, 4)} />
        </>
      )}
    </div>
  );
}

function Eligibility({ ownBooking }: { ownBooking: boolean }) {
  return (
    <Surface>
      <h2 className="font-display text-xl font-semibold">Withdrawal Eligibility</h2>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <Check className="size-4 text-pine" />
          Growth Program Active
        </li>
        <li className="flex items-center gap-2">
          {ownBooking ? <Check className="size-4 text-pine" /> : <X className="size-4 text-clay" />}
          Own confirmed booking
        </li>
      </ul>
      {!ownBooking ? (
        <p className="mt-4 text-sm text-muted">Complete your own property booking to unlock withdrawals.</p>
      ) : (
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/app/commission">View earnings</Link>
        </Button>
      )}
    </Surface>
  );
}
function Recent({ rows }: { rows: Array<{ id: string; type: string; reference: string; amount: number; status: string }> }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold">Recent Transactions</h2>
      {rows.length ? (
        <ul className="mt-4 divide-y divide-line rounded-2xl bg-cream">
          {rows.map((t) => (
            <li key={`${t.type}-${t.id}`} className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-sm font-medium capitalize">{t.type}</p>
                <p className="text-xs text-muted">{t.reference}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatBdt(t.amount)}</p>
                <StatusBadge status={t.status} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No transactions yet.</p>
      )}
    </section>
  );
}
