import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { formatWhen, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/app/bookings/$id")({
  component: BookingDetailPage,
});

function BookingDetailPage() {
  const { id } = Route.useParams();
  const { member } = useMemberSession();
  const booking = usePlatform((s) => s.bookings.find((b) => b.id === id));
  if (!member) return null;
  if (!booking || booking.userId !== member.userId) throw notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Booking"
        title={booking.offerTitle}
        description={`${booking.category}${booking.location ? ` · ${booking.location}` : ""}`}
        action={<StatusBadge status={booking.status} />}
      />

      <div className="overflow-hidden rounded-2xl">
        <img src={booking.image} alt="" className="aspect-[16/8] w-full object-cover" />
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          ["Retail value", booking.retailValue],
          ["Booking amount", booking.bookingAmount],
          ["Qualification benefit", booking.qualificationBenefit],
        ].map(([label, value]) => (
          <Surface key={String(label)}>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</dt>
            <dd className="mt-2 font-display text-2xl font-semibold tabular-nums">
              {formatBdt(value as number)}
            </dd>
            <p className="mt-1 text-xs text-subtle">This offer only</p>
          </Surface>
        ))}
      </dl>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Timeline</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li>Requested {formatWhen(booking.createdAt)}</li>
          <li>Confirmed {formatWhen(booking.confirmedAt)}</li>
          <li>Activated {formatWhen(booking.activatedAt)}</li>
        </ul>
        <p className="mt-4 text-sm text-muted">
          Pending means operations has not confirmed this request yet. Cancelled and reversed
          history is kept.
        </p>
        <Button asChild variant="secondary" className="mt-5">
          <Link to="/properties/$slug" params={{ slug: booking.offerSlug }}>
            View offer
          </Link>
        </Button>
      </Surface>
    </div>
  );
}
