import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { AmountRow, LoadingState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { formatWhen } from "@/lib/platform";
import { formatCalendarDate } from "@/lib/offers";
import { api, ApiError } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { MerchantRequestStatus } from "@/components/payment-form";

export const Route = createFileRoute("/app/bookings/$id")({
  component: BookingDetailPage,
});

function BookingDetailPage() {
  const { id } = Route.useParams();
  const { member } = useMemberSession();
  const { data, error, loading, reload } = useAsync(() => api.booking(id), [id], { enabled: Boolean(member) });

  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  if (!member) return null;

  if (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <p className="font-display text-xl font-semibold">{missing ? "Booking not found" : "Could not load this booking"}</p>
        {!missing ? <p className="text-sm text-muted">{error.message}</p> : null}
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
          {booking.installment_amount ? <AmountRow label="Installment Amount" value={booking.installment_amount} /> : null}
          {booking.installment_duration_months ? (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line py-2.5 last:border-0">
              <dt className="min-w-0 text-sm text-muted">Installment Duration</dt>
              <dd className="text-right text-sm font-medium text-ink">
                {booking.installment_duration_months} month{booking.installment_duration_months === 1 ? "" : "s"}
              </dd>
            </div>
          ) : null}
          {formatCalendarDate(booking.payment_completion_deadline) ? (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line py-2.5 last:border-0">
              <dt className="min-w-0 text-sm text-muted">Payment Completion Deadline</dt>
              <dd className="text-right text-sm font-medium text-ink">{formatCalendarDate(booking.payment_completion_deadline)}</dd>
            </div>
          ) : null}
        </dl>
        {!formatCalendarDate(booking.payment_completion_deadline) && booking.full_payment_deadline_days ? (
          <p className="mt-3 text-sm text-muted">
            Frozen full-payment deadline: {booking.full_payment_deadline_days} days after booking.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-subtle">Figures belong to this offer only. They do not change if the live offer is edited later.</p>
      </Surface>

      {merchantRequest ? <MerchantRequestStatus request={merchantRequest} /> : null}

      <Surface>
        <h2 className="font-display text-xl font-semibold">Timeline</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li>Requested {formatWhen(booking.created_at)}</li>
          <li>{booking.confirmed_at ? `Confirmed ${formatWhen(booking.confirmed_at)}` : "Not yet confirmed"}</li>
          {booking.activated_at ? <li>Activated {formatWhen(booking.activated_at)}</li> : null}
        </ul>
        <p className="mt-4 text-sm text-muted">
          {booking.status === "pending"
            ? "Pending means operations has not confirmed this request yet. Cancelled and reversed history is kept."
            : "Cancelled and reversed history is kept."}
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