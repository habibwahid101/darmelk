import { createFileRoute, Link } from "@tanstack/react-router";
import { AmountRow, LoadingState, PageHeader, Surface } from "@/components/states";
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
  const { data, error, loading } = useAsync(() => api.booking(id), [id], { enabled: Boolean(member) });

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
  const merchantRequest = data?.merchantRequest;
  if (loading && !booking) {
    return <LoadingState label="Loading booking…" />;
  }
  if (!booking) return <LoadingState label="Loading booking…" />;

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
          {booking.full_payment_price ? <AmountRow label="Full payment price" value={booking.full_payment_price} /> : null}
          <AmountRow label="Booking amount" value={booking.booking_amount} />
          <AmountRow label="Qualification benefit" value={booking.qualification_benefit} />
        </dl>
        {booking.installment_enabled && booking.installment_count && booking.installment_amount ? (
          <p className="mt-3 text-sm text-muted">
            Frozen installment plan: {booking.installment_count} {booking.installment_frequency ?? ""} payments of{" "}
            {booking.installment_amount.toLocaleString("en-US")} BDT
            {booking.full_payment_deadline_days ? ` · full payment within ${booking.full_payment_deadline_days} days` : ""}.
          </p>
        ) : booking.full_payment_deadline_days ? (
          <p className="mt-3 text-sm text-muted">Frozen full-payment deadline: {booking.full_payment_deadline_days} days after booking.</p>
        ) : null}
        <p className="mt-3 text-xs text-subtle">Figures belong to this offer only. They do not change if the live offer is edited later.</p>
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Timeline</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li>Requested {formatWhen(booking.created_at)}</li>
          <li>{booking.confirmed_at ? `Confirmed ${formatWhen(booking.confirmed_at)}` : "Not yet confirmed"}</li>
          {booking.activated_at ? <li>Activated {formatWhen(booking.activated_at)}</li> : null}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Pending means operations has not confirmed this request yet. Cancelled and reversed
          history is kept.
        </p>
        {merchantRequest ? (
          <div className="mt-5 rounded-xl bg-paper p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Pay by Merchant</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="break-all text-sm text-muted">Request {merchantRequest.id}</p>
              <StatusBadge status={merchantRequest.status} />
            </div>
            <p className="mt-2 text-sm text-muted">
              Merchant approval reserves credit. Darmelk confirmation and activation still follow the existing booking process.
            </p>
          </div>
        ) : null}
        <Button asChild variant="secondary" className="mt-5">
          <Link to="/properties/$slug" params={{ slug: booking.offer_slug }}>
            View offer
          </Link>
        </Button>
      </Surface>
    </div>
  );
}
