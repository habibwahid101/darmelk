import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SuccessBanner, Surface } from "@/components/states";
import { OfferAvailabilityNote, OfferCommercialTerms } from "@/components/offer-commercial-terms";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt, fromApiOffer, getOffer, isBookable, isSoldOut } from "@/lib/offers";
import { api, ApiError, type MerchantPaymentRequest } from "@/lib/api-client";
import { PaymentForm, MerchantRequestStatus, MERCHANT_REQUEST_ALREADY_SUBMITTED, MERCHANT_REQUEST_SUBMITTED, describePaymentOptions } from "@/components/payment-form";
import { TermsAccept } from "@/components/terms-accept";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/book/$slug")({
  loader: async ({ params }) => {
    let mapped;
    try {
      const { offer } = await api.offer(params.slug);
      mapped = fromApiOffer(offer);
    } catch {
      mapped = getOffer(params.slug);
    }
    if (!mapped || !isBookable(mapped.status)) throw notFound();
    return { offer: mapped };
  },
  component: BookOfferPage,
});

function BookOfferPage() {
  const { offer } = Route.useLoaderData();
  const { member } = useMemberSession();
  const [step, setStep] = useState<"review" | "payment" | "done">("review");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [merchantRequest, setMerchantRequest] = useState<MerchantPaymentRequest | null>(null);
  const [merchantAlreadyOpen, setMerchantAlreadyOpen] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const { data: optionData } = useAsync(() => api.paymentOptions("booking"), []);
  const { data: consentData, loading: consentsLoading, error: consentError } = useAsync(
    () => api.myConsents(),
    [member?.user_id],
    { enabled: Boolean(member) },
  );
  const { data: termsData, loading: termsLoading, error: termsLoadError } = useAsync(
    () => api.terms(["PROPERTY_BOOKING_TERMS"]),
    [member?.user_id],
    { enabled: Boolean(member) },
  );
  const soldOut = isSoldOut(offer);
  const termsLoaded = Boolean(consentData && termsData) && !consentsLoading && !termsLoading;
  const currentTerms = termsData?.documents.find((doc) => doc.key === "PROPERTY_BOOKING_TERMS");
  const alreadyAccepted = Boolean(
    termsLoaded &&
      currentTerms &&
      consentData?.consents.some(
        (consent) => consent.document_key === "PROPERTY_BOOKING_TERMS" && consent.document_version === currentTerms.version,
      ),
  );
  const termsReady = termsLoaded && (alreadyAccepted || Boolean(accepted.PROPERTY_BOOKING_TERMS));

  if (!member) return null;

  async function submit() {
    if (!termsLoaded || !termsReady) {
      setError("Property Booking Terms must be accepted.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { booking } = await api.createBooking(offer.slug, crypto.randomUUID(), true);
      setBookingId(booking.id);
      setStep("payment");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not confirm this booking.");
    } finally {
      setPending(false);
    }
  }

  if (step === "done" && bookingId) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <SuccessBanner
          title={
            merchantRequest
              ? merchantAlreadyOpen
                ? MERCHANT_REQUEST_ALREADY_SUBMITTED
                : MERCHANT_REQUEST_SUBMITTED
              : "Payment submitted"
          }
          description={
            merchantRequest
              ? "The selected Merchant can approve or decline this request. Merchant approval confirms the booking. It does not wait for Darmelk."
              : "Your booking payment is under review. It is confirmed and activated only after admin approval."
          }
        />
        {merchantRequest ? <MerchantRequestStatus request={merchantRequest} /> : null}
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

  if (step === "payment" && bookingId) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <PageHeader
          kicker="Booking payment"
          title={offer.title}
          description={describePaymentOptions(optionData?.options, "booking")}
        />
        <PaymentForm targetType="booking" targetId={bookingId} amount={offer.bookingAmount} onSubmitted={(result) => { setMerchantRequest(result?.merchantRequest ?? null); setMerchantAlreadyOpen(result?.alreadyOpen === true); setStep("done"); }} />
      </div>
    );
  }

  if (member.activation_status !== "active") return <div className="mx-auto max-w-xl space-y-6"><PageHeader kicker="Booking" title="Growth Program Activation required" description="Growth Program Activation approval is required before a property booking can be submitted."/><Surface><p className="text-sm text-muted">Activate the Growth Program first. The annual fee is separate from the property booking amount.</p><Button asChild className="mt-5"><Link to="/app/activation">Go to Growth Program Activation</Link></Button></Surface></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Surface className="grid gap-5 sm:grid-cols-[10rem_1fr] sm:items-center">
        <img src={offer.image} alt="" className="aspect-[16/11] w-full rounded-xl object-cover" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{offer.category}</p>
          <h1 className="mt-1 text-pretty font-display text-2xl font-semibold sm:text-3xl">{offer.title}</h1>
          {offer.location ? (
            <p className="mt-2 flex min-w-0 items-center gap-2 text-sm text-muted">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{offer.location}</span>
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted">{offer.summary}</p>
        </div>
      </Surface>

      <div className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
        <OfferCommercialTerms offer={offer} variant="growth" />
        <OfferAvailabilityNote offer={offer} />
      </div>

      {soldOut ? (
        <Surface>
          <p className="text-sm font-medium">This property is sold out</p>
          <p className="mt-2 text-sm text-muted">A Request to Book remains an enquiry and does not reserve a unit.</p>
        </Surface>
      ) : (
        <Surface>
          <h2 className="text-sm font-medium">Before you confirm</h2>
          <p className="mt-3 text-sm text-muted">
            Your booking will be created using the commercial terms shown above. These terms will remain attached to this booking even if the live offer is updated later.
          </p>
          <p className="mt-3 text-sm text-muted">
            After confirming, you will proceed to payment using the available payment methods.
          </p>
          <div className="mt-5">
            {termsLoadError || consentError ? (
              <p className="text-sm text-clay" role="alert">Booking terms could not be loaded.</p>
            ) : !termsLoaded ? (
              <p className="text-sm text-muted" role="status">Loading booking terms…</p>
            ) : alreadyAccepted ? (
              <p className="text-sm text-muted">Property Booking Terms for this booking are already accepted.</p>
            ) : (
              <TermsAccept
                hideLegend
                items={[
                  {
                    key: "PROPERTY_BOOKING_TERMS",
                    label: "Property Booking Terms for this booking",
                    href: "/terms?key=booking",
                  },
                ]}
                accepted={accepted}
                onChange={(key, value) => setAccepted((current) => ({ ...current, [key]: value }))}
              />
            )}
          </div>
          {error ? <p className="mt-3 text-sm text-clay" role="alert">{error}</p> : null}
        </Surface>
      )}

      <div className="flex flex-col items-stretch gap-3">
        {soldOut ? (
          <Button asChild variant="secondary">
            <Link to="/properties/$slug" params={{ slug: offer.slug }}>
              Back to offer
            </Link>
          </Button>
        ) : (
          <>
            <Button onClick={() => void submit()} disabled={pending || !termsReady}>
              {pending ? "Submitting…" : "Confirm Booking"}
            </Button>
            <Button asChild variant="ghost">
              <Link to="/properties/$slug" params={{ slug: offer.slug }}>
                Back to offer
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
