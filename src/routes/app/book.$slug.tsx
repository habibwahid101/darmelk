import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AmountRow, PageHeader, SuccessBanner, Surface } from "@/components/states";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt, getOffer } from "@/lib/offers";
import { api, ApiError } from "@/lib/api-client";
import { PaymentForm } from "@/components/payment-form";

const ACTIVATION_FEE = 1000;

export const Route = createFileRoute("/app/book/$slug")({
  loader: ({ params }) => {
    const offer = getOffer(params.slug);
    if (!offer || offer.status !== "available") throw notFound();
    return { offer };
  },
  component: BookOfferPage,
});

function BookOfferPage() {
  const { offer } = Route.useLoaderData();
  const { member } = useMemberSession();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  if (!member) return null;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const { booking } = await api.createBooking(offer.slug, crypto.randomUUID());
      setBookingId(booking.id);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit booking request.");
    } finally {
      setPending(false);
    }
  }

  if (step === 4 && bookingId) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <SuccessBanner
          title="Payment submitted"
          description="Your booking payment is under review. It is confirmed and activated only after admin approval."
        />
        <Surface>
          <p className="text-sm text-muted">Reference</p>
          <p className="font-medium">{bookingId}</p>
          <p className="mt-4 text-sm text-muted">{offer.title}</p>
          <p className="whitespace-nowrap font-display text-2xl font-semibold">{formatBdt(offer.bookingAmount)}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="w-full sm:flex-1">
              <Link to="/app/bookings/$id" params={{ id: bookingId }}>
                View booking
              </Link>
            </Button>
            <Button asChild variant="secondary" className="w-full sm:flex-1">
              <Link to="/app">Overview</Link>
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  if (step === 3 && bookingId) return <div className="mx-auto max-w-2xl space-y-8"><PageHeader kicker="Booking payment" title={offer.title} description="Use an approved manual payment destination and submit proof for review." /><PaymentForm targetType="booking" targetId={bookingId} amount={offer.bookingAmount} onSubmitted={()=>setStep(4)} /></div>;

  if (member.activation_status !== "active") return <div className="mx-auto max-w-xl space-y-6"><PageHeader kicker="Booking" title="Activation required" description="Annual activation approval is required before a property booking can be submitted."/><Surface><p className="text-sm text-muted">Activate your member ID first. The annual fee is separate from the property booking amount.</p><Button asChild className="mt-5"><Link to="/app/activation">Go to activation</Link></Button></Surface></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        kicker="Booking"
        title={step === 1 ? "Review offer" : "Booking summary"}
        description="Figures belong to this offer only. Commission is not charged here."
      />

      <ol className="grid grid-cols-2 gap-2 text-xs font-medium uppercase tracking-wide">
        {["Review", "Confirm"].map((label, i) => (
          <li
            key={label}
            className={
              step === i + 1
                ? "rounded-full bg-pine px-3 py-2 text-center text-pine-fg"
                : "rounded-full bg-mist px-3 py-2 text-center text-muted"
            }
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <Surface className="grid gap-5 sm:grid-cols-[10rem_1fr] sm:items-center">
        <img src={offer.image} alt="" className="aspect-[16/11] rounded-xl object-cover" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{offer.category}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{offer.title}</h2>
          <p className="mt-2 text-sm text-muted">{offer.summary}</p>
        </div>
      </Surface>

      <dl className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
        <AmountRow label="Retail value" value={offer.retailValue} />
        <AmountRow label="Amount due now (booking)" value={offer.bookingAmount} />
        <AmountRow label="Qualification benefit (this offer)" value={offer.qualificationBenefit} />
      </dl>

        {step === 2 ? (
        <Surface>
          <p className="text-sm font-medium">What happens next</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>You submit a booking request for {formatBdt(offer.bookingAmount)}.</li>
            <li>After creating the request, submit manual payment proof.</li>
            <li>Admin approval confirms and activates the booking.</li>
            <li>Qualification benefit stays attached to this offer, not a global figure.</li>
            <li>
              Annual activation is a separate {formatBdt(ACTIVATION_FEE)} fee and is not part of this
              booking.
            </li>
          </ul>
          {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
        </Surface>
      ) : null}

      <div className="flex flex-col items-stretch gap-3">
        {step === 1 ? (
          <>
            <Button onClick={() => setStep(2)}>Continue to summary</Button>
            <Button asChild variant="ghost">
              <Link to="/properties/$slug" params={{ slug: offer.slug }}>
                Back to offer
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => void submit()} disabled={pending}>
              {pending ? "Submitting…" : "Submit booking request"}
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)} disabled={pending}>
              Back
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
