import { AmountRow } from "@/components/states";
import {
  formatBdt,
  installmentSummary,
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
  const plan = installmentSummary(offer);
  const soldOut = isSoldOut(offer);
  const available = offer.inventory?.available;
  const tracked = offer.inventory?.total != null;

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
      {offer.fullPaymentDeadlineDays ? (
        <FactRow
          label="Full payment deadline"
          value={`${offer.fullPaymentDeadlineDays} day${offer.fullPaymentDeadlineDays === 1 ? "" : "s"} after booking`}
        />
      ) : null}
      {plan ? <FactRow label="Installment plan" value={plan} /> : null}
      {offer.installmentEnabled && offer.installmentDurationMonths ? (
        <FactRow label="Installment duration" value={`${offer.installmentDurationMonths} month${offer.installmentDurationMonths === 1 ? "" : "s"}`} />
      ) : null}
      {offer.installmentEnabled && offer.firstInstallmentDueRule ? (
        <FactRow label="First installment" value={offer.firstInstallmentDueRule} />
      ) : null}
      {tracked ? (
        <FactRow
          label="Available quantity"
          value={soldOut ? "Sold out" : String(available ?? 0)}
        />
      ) : null}
    </dl>
  );
}

export function OfferAvailabilityNote({ offer }: { offer: PropertyOffer }) {
  if (offer.inventory?.total == null) return null;
  if (isSoldOut(offer)) {
    return <p className="mt-3 text-sm font-medium text-clay">This property is currently sold out.</p>;
  }
  return (
    <p className="mt-3 text-sm text-muted">
      {offer.inventory.available} of {offer.inventory.total} remaining. A Request to Book is an enquiry and does not
      reserve a unit.
    </p>
  );
}

export function offerBookingCopy(offer: PropertyOffer): string {
  return `You submit a booking request for ${formatBdt(offer.bookingAmount)}.`;
}
