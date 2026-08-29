import { createFileRoute, Link } from "@tanstack/react-router";
import { AmountRow, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { formatWhen } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/bookings/$id")({
  component: BookingDetailPage,
});

function BookingDetailPage() {
  const { id } = Route.useParams();
  const { member } = useMemberSession();
  const { data, error } = useAsync(() => api.booking(id), [id], { enabled: Boolean(member) });

  if (!member) return null;

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <p className="font-display text-xl font-semibold">Booking not found</p>
        <Button asChild variant="secondary">
          <Link to="/app/bookings">Back to bookings</Link>
        </Button>
      </div>
    );
  }

  const booking = data?.booking;
  if (!booking) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Booking"
        title={booking.offer_title ?? booking.offer_slug}
        description={booking.category ?? ""}
        action={<StatusBadge status={booking.status} />}
      />

      <div className="overflow-hidden rounded-2xl">
        <img src={booking.image ?? "/images/hero-hotel.jpg"} alt="" className="aspect-[16/8] w-full object-cover" />
      </div>

      <Surface>
        <dl>
          <AmountRow label="Retail value" value={booking.retail_value} />
          <AmountRow label="Booking amount" value={booking.booking_amount} />
          <AmountRow label="Qualification benefit" value={booking.qualification_benefit} />
        </dl>
        <p className="mt-3 text-xs text-subtle">Figures belong to this offer only.</p>
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Timeline</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li>Requested {formatWhen(booking.created_at)}</li>
          <li>Confirmed {formatWhen(booking.confirmed_at)}</li>
          <li>Activated {formatWhen(booking.activated_at)}</li>
        </ul>
        <p className="mt-4 text-sm text-muted">
          Pending means operations has not confirmed this request yet. Cancelled and reversed
          history is kept.
        </p>
        <Button asChild variant="secondary" className="mt-5">
          <Link to="/properties/$slug" params={{ slug: booking.offer_slug }}>
            View offer
          </Link>
        </Button>
      </Surface>
    </div>
  );
}
