import { AmountRow } from "@/components/states";
import {
  formatBdt,
  formatCalendarDate,
  isSoldOut,
  type PropertyOffer,
} from "@/lib/offers";

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line py-2.5 last:border-0 last:pb-0 first:pt-0">
      <dt className="min-w-0 text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

export function OfferCommercialTerms({
  offer,
  variant = "public",
  compact = false,
}: {
  offer: PropertyOffer;
  variant?: "public" | "growth";
  compact?: boolean;
}) {
  const deadline = formatCalendarDate(offer.paymentCompletionDeadline);

  return (
    <dl>
      <AmountRow compact={compact} label="Property value" value={offer.retailValue} />
      {offer.fullPaymentPrice ? (
        <AmountRow compact={compact} label="Full payment price" value={offer.fullPaymentPrice} />
      ) : null}
      <AmountRow compact={compact} label="Booking amount" value={offer.bookingAmount} />
      {variant === "growth" ? (
        <AmountRow compact={compact} label="Qualification benefit (this offer)" value={offer.qualificationBenefit} />
      ) : null}
      {deadline ? <FactRow label="Payment Completion Deadline" value={deadline} /> : null}
      {offer.installmentAmount ? <FactRow label="Installment Amount" value={formatBdt(offer.installmentAmount)} /> : null}
      {offer.installmentDurationMonths ? (
        <FactRow
          label="Installment Duration"
          value={`${offer.installmentDurationMonths} month${offer.installmentDurationMonths === 1 ? "" : "s"}`}
        />
      ) : null}
    </dl>
  );
}

export function OfferAvailabilityNote({ offer }: { offer: PropertyOffer }) {
  if (!isSoldOut(offer)) return null;
  return <p className="mt-3 text-sm font-medium text-clay">This property is currently sold out.</p>;
}

export function offerBookingCopy(offer: PropertyOffer): string {
  return `You submit a booking request for ${formatBdt(offer.bookingAmount)}.`;
}
