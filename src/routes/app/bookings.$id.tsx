import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AmountRow, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
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

      <Surface>
        <dl>
          <AmountRow label="Retail value" value={booking.retailValue} />
          <AmountRow label="Booking amount" value={booking.bookingAmount} />
          <AmountRow label="Qualification benefit" value={booking.qualificationBenefit} />
        </dl>
        <p className="mt-3 text-xs text-subtle">Figures belong to this offer only.</p>
      </Surface>

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
