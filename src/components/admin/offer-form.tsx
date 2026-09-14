import { useState, type ReactNode } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CATEGORIES, persistMediaSrc, type PropertyOffer, resolveMediaSrc } from "@/lib/offers";

export type OfferFormValue = {
  title: string;
  slug: string;
  categorySlug: string;
  location: string;
  summary: string;
  details: string;
  featuresText: string;
  notes: string;
  retailValue: string;
  bookingAmount: string;
  qualificationBenefit: string;
  commissionEligibleAmount: string;
  fullPaymentPrice: string;
  fullPaymentDeadlineDays: string;
  installmentEnabled: boolean;
  installmentCount: string;
  installmentFrequency: string;
  installmentAmount: string;
  installmentDurationMonths: string;
  firstInstallmentDueRule: string;
  gracePeriodDays: string;
  totalQuantity: string;
  soldQuantity: number;
  reservedQuantity: number | null;
  availableQuantity: number | null;
  image: string;
  heroImage: string;
  galleryText: string;
  flagship: boolean;
  displayOrder: string;
};

function optionalNumber(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function emptyOfferForm(): OfferFormValue {
  return {
    title: "",
    slug: "",
    categorySlug: CATEGORIES[0]?.slug ?? "hotel-resort-shares",
    location: "",
    summary: "",
    details: "",
    featuresText: "",
    notes: "",
    retailValue: "",
    bookingAmount: "",
    qualificationBenefit: "",
    commissionEligibleAmount: "",
    fullPaymentPrice: "",
    fullPaymentDeadlineDays: "",
    installmentEnabled: false,
    installmentCount: "",
    installmentFrequency: "monthly",
    installmentAmount: "",
    installmentDurationMonths: "",
    firstInstallmentDueRule: "",
    gracePeriodDays: "",
    totalQuantity: "",
    soldQuantity: 0,
    reservedQuantity: null,
    availableQuantity: null,
    image: "",
    heroImage: "",
    galleryText: "",
    flagship: false,
    displayOrder: "0",
  };
}

export function formFromOffer(offer: PropertyOffer): OfferFormValue {
  return {
    title: offer.title,
    slug: offer.slug,
    categorySlug: offer.categorySlug,
    location: offer.location ?? "",
    summary: offer.summary,
    details: offer.details ?? "",
    featuresText: (offer.features ?? []).join("\n"),
    notes: offer.notes ?? "",
    retailValue: String(offer.retailValue),
    bookingAmount: String(offer.bookingAmount),
    qualificationBenefit: String(offer.qualificationBenefit),
    commissionEligibleAmount: String(offer.commissionEligibleAmount ?? offer.bookingAmount),
    fullPaymentPrice: offer.fullPaymentPrice != null ? String(offer.fullPaymentPrice) : "",
    fullPaymentDeadlineDays: offer.fullPaymentDeadlineDays != null ? String(offer.fullPaymentDeadlineDays) : "",
    installmentEnabled: Boolean(offer.installmentEnabled),
    installmentCount: offer.installmentCount != null ? String(offer.installmentCount) : "",
    installmentFrequency: offer.installmentFrequency || "monthly",
    installmentAmount: offer.installmentAmount != null ? String(offer.installmentAmount) : "",
    installmentDurationMonths: offer.installmentDurationMonths != null ? String(offer.installmentDurationMonths) : "",
    firstInstallmentDueRule: offer.firstInstallmentDueRule ?? "",
    gracePeriodDays: offer.gracePeriodDays != null ? String(offer.gracePeriodDays) : "",
    totalQuantity: offer.totalQuantity != null ? String(offer.totalQuantity) : offer.inventory?.total != null ? String(offer.inventory.total) : "",
    soldQuantity: offer.inventory?.sold ?? 0,
    reservedQuantity: offer.inventory?.reserved ?? null,
    availableQuantity: offer.inventory?.available ?? null,
    image: persistMediaSrc(offer.image),
    heroImage: persistMediaSrc(offer.heroImage ?? ""),
    galleryText: (offer.gallery ?? []).map(persistMediaSrc).join("\n"),
    flagship: Boolean(offer.flagship),
    displayOrder: String(offer.displayOrder ?? 0),
  };
}

export function payloadFromForm(form: OfferFormValue, opts?: { includeSlug?: boolean }) {
  const features = form.featuresText.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const gallery = form.galleryText.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    categorySlug: form.categorySlug,
    location: form.location.trim(),
    summary: form.summary.trim(),
    details: form.details.trim(),
    features,
    notes: form.notes.trim(),
    retailValue: Number(form.retailValue),
    bookingAmount: Number(form.bookingAmount),
    qualificationBenefit: Number(form.qualificationBenefit),
    commissionEligibleAmount: Number(form.commissionEligibleAmount || form.bookingAmount),
    fullPaymentPrice: optionalNumber(form.fullPaymentPrice),
    fullPaymentDeadlineDays: optionalNumber(form.fullPaymentDeadlineDays),
    installmentEnabled: form.installmentEnabled,
    installmentCount: optionalNumber(form.installmentCount),
    installmentFrequency: form.installmentEnabled ? form.installmentFrequency || null : null,
    installmentAmount: optionalNumber(form.installmentAmount),
    installmentDurationMonths: optionalNumber(form.installmentDurationMonths),
    firstInstallmentDueRule: form.firstInstallmentDueRule.trim() || null,
    gracePeriodDays: optionalNumber(form.gracePeriodDays),
    totalQuantity: optionalNumber(form.totalQuantity),
    image: persistMediaSrc(form.image.trim()) || null,
    heroImage: persistMediaSrc(form.heroImage.trim()) || null,
    gallery: gallery.map(persistMediaSrc),
    flagship: form.flagship,
    displayOrder: Number(form.displayOrder || 0),
  };
  if (opts?.includeSlug && form.slug.trim()) payload.slug = form.slug.trim();
  return payload;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-5 grid min-w-0 gap-4">{children}</div>
    </section>
  );
}

export function OfferForm({
  value,
  onChange,
  onSubmit,
  pending,
  error,
  slugLocked,
  submitLabel,
}: {
  value: OfferFormValue;
  onChange: (next: OfferFormValue) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  slugLocked?: boolean;
  submitLabel: string;
}) {
  const set = (patch: Partial<OfferFormValue>) => onChange({ ...value, ...patch });
  const [bookingTouchedCommission, setBookingTouchedCommission] = useState(false);
  const derivedAvailable =
    optionalNumber(value.totalQuantity) == null ? null : Math.max(0, (optionalNumber(value.totalQuantity) ?? 0) - value.soldQuantity);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {error ? <p className="text-sm text-clay">{error}</p> : null}

      <Section title="Basic information">
        <Field label="Title" htmlFor="offer-title">
          <Input id="offer-title" value={value.title} onChange={(e) => set({ title: e.target.value })} required />
        </Field>
        <Field label="Slug" hint={slugLocked ? "Slug cannot change after create." : "Leave blank to generate from the title."} htmlFor="offer-slug">
          <Input
            id="offer-slug"
            value={value.slug}
            onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
            disabled={slugLocked}
            placeholder="five-star-hotel-share"
          />
        </Field>
        <Field label="Category" htmlFor="offer-category">
          <select
            id="offer-category"
            className="field-control"
            value={value.categorySlug}
            onChange={(e) => set({ categorySlug: e.target.value })}
            required
          >
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location" htmlFor="offer-location">
          <Input id="offer-location" value={value.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
      </Section>

      <Section title="Property details">
        <Field label="Short description" htmlFor="offer-summary">
          <textarea
            id="offer-summary"
            className="field-control min-h-24 py-2"
            value={value.summary}
            onChange={(e) => set({ summary: e.target.value })}
          />
        </Field>
        <Field label="Full description" htmlFor="offer-details">
          <textarea
            id="offer-details"
            className="field-control min-h-32 py-2"
            value={value.details}
            onChange={(e) => set({ details: e.target.value })}
          />
        </Field>
        <Field label="Key features" hint="One feature per line." htmlFor="offer-features">
          <textarea
            id="offer-features"
            className="field-control min-h-24 py-2"
            value={value.featuresText}
            onChange={(e) => set({ featuresText: e.target.value })}
          />
        </Field>
        <Field label="Internal notes" hint="Not shown on the public page." htmlFor="offer-notes">
          <textarea
            id="offer-notes"
            className="field-control min-h-20 py-2"
            value={value.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Financial details">
        <p className="text-sm text-muted">These amounts belong to this offer only. Existing bookings keep their original snapshot. General Marketplace and Growth Program share this same offer.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Regular / total price (BDT)" htmlFor="offer-retail">
            <Input id="offer-retail" inputMode="numeric" value={value.retailValue} onChange={(e) => set({ retailValue: e.target.value })} required />
          </Field>
          <Field label="Full payment price (BDT)" hint="Optional cash price if paid in full." htmlFor="offer-full-price">
            <Input id="offer-full-price" inputMode="numeric" value={value.fullPaymentPrice} onChange={(e) => set({ fullPaymentPrice: e.target.value })} />
          </Field>
          <Field label="Booking amount (BDT)" htmlFor="offer-booking">
            <Input
              id="offer-booking"
              inputMode="numeric"
              value={value.bookingAmount}
              onChange={(e) => {
                const bookingAmount = e.target.value;
                set({
                  bookingAmount,
                  commissionEligibleAmount: bookingTouchedCommission ? value.commissionEligibleAmount : bookingAmount,
                });
              }}
              required
            />
          </Field>
          <Field label="Full payment deadline (days)" hint="Days after booking. Leave blank if unused." htmlFor="offer-full-deadline">
            <Input id="offer-full-deadline" inputMode="numeric" value={value.fullPaymentDeadlineDays} onChange={(e) => set({ fullPaymentDeadlineDays: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Growth qualification">
        <p className="text-sm text-muted">Shown in the Growth Program booking flow. Not featured on the public marketplace.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Qualification benefit (BDT)" htmlFor="offer-benefit">
            <Input id="offer-benefit" inputMode="numeric" value={value.qualificationBenefit} onChange={(e) => set({ qualificationBenefit: e.target.value })} required />
          </Field>
          <Field label="Commission-eligible amount (BDT)" htmlFor="offer-commission">
            <Input
              id="offer-commission"
              inputMode="numeric"
              value={value.commissionEligibleAmount}
              onChange={(e) => {
                setBookingTouchedCommission(true);
                set({ commissionEligibleAmount: e.target.value });
              }}
              required
            />
          </Field>
        </div>
      </Section>

      <Section title="Payment plan">
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={value.installmentEnabled}
            onChange={(e) => set({ installmentEnabled: e.target.checked })}
            className="size-4 accent-[var(--color-pine)]"
          />
          Installments are available for this offer
        </label>
        {value.installmentEnabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Installment count" htmlFor="offer-inst-count">
              <Input id="offer-inst-count" inputMode="numeric" value={value.installmentCount} onChange={(e) => set({ installmentCount: e.target.value })} required />
            </Field>
            <Field label="Frequency" htmlFor="offer-inst-freq">
              <select
                id="offer-inst-freq"
                className="field-control"
                value={value.installmentFrequency}
                onChange={(e) => set({ installmentFrequency: e.target.value })}
                required
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
            <Field label="Installment amount (BDT)" hint="Leave blank to divide full payment price by count." htmlFor="offer-inst-amount">
              <Input id="offer-inst-amount" inputMode="numeric" value={value.installmentAmount} onChange={(e) => set({ installmentAmount: e.target.value })} />
            </Field>
            <Field label="Duration (months)" htmlFor="offer-inst-duration">
              <Input id="offer-inst-duration" inputMode="numeric" value={value.installmentDurationMonths} onChange={(e) => set({ installmentDurationMonths: e.target.value })} />
            </Field>
            <Field label="First installment due" htmlFor="offer-inst-first">
              <Input id="offer-inst-first" value={value.firstInstallmentDueRule} onChange={(e) => set({ firstInstallmentDueRule: e.target.value })} placeholder="30 days after booking" />
            </Field>
            <Field label="Grace period (days)" htmlFor="offer-inst-grace">
              <Input id="offer-inst-grace" inputMode="numeric" value={value.gracePeriodDays} onChange={(e) => set({ gracePeriodDays: e.target.value })} />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-muted">Installment fields stay hidden until this offer offers a payment plan.</p>
        )}
      </Section>

      <Section title="Inventory">
        <p className="text-sm text-muted">
          Shared stock for General Marketplace and Growth Program. Available = total − sold. Pending requests and Request
          to Book do not reserve units. Display order is listing order, not stock.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total quantity" hint="Leave blank for unbounded. Cannot go below sold." htmlFor="offer-qty-total">
            <Input id="offer-qty-total" inputMode="numeric" value={value.totalQuantity} onChange={(e) => set({ totalQuantity: e.target.value })} />
          </Field>
          <Field label="Sold quantity" hint="Binding confirmations. Read only." htmlFor="offer-qty-sold">
            <Input id="offer-qty-sold" value={String(value.soldQuantity)} disabled />
          </Field>
          <Field label="Reserved quantity" hint="Deferred. Pending does not hold stock." htmlFor="offer-qty-reserved">
            <Input id="offer-qty-reserved" value="Not reserved at request" disabled />
          </Field>
          <Field label="Available quantity" hint="Read only." htmlFor="offer-qty-available">
            <Input
              id="offer-qty-available"
              value={derivedAvailable == null ? "Unbounded" : String(derivedAvailable)}
              disabled
            />
          </Field>
        </div>
      </Section>

      <Section title="Images">
        <p className="text-sm text-muted">Use an existing `/images/...` path or upload files after saving. Only this offer’s images are shown.</p>
        {value.image ? (
          <img src={resolveMediaSrc(value.image)} alt="" className="aspect-[16/10] max-w-sm rounded-xl object-cover" />
        ) : null}
        <Field label="Main / cover image URL" htmlFor="offer-image">
          <Input id="offer-image" value={value.image} onChange={(e) => set({ image: e.target.value })} placeholder="/images/flagship-suite.jpg" />
        </Field>
        <Field label="Hero image URL" htmlFor="offer-hero">
          <Input id="offer-hero" value={value.heroImage} onChange={(e) => set({ heroImage: e.target.value })} placeholder="/images/hero-hotel.jpg" />
        </Field>
        <Field label="Gallery image URLs" hint="One URL per line. Order is preserved." htmlFor="offer-gallery">
          <textarea
            id="offer-gallery"
            className="field-control min-h-24 py-2"
            value={value.galleryText}
            onChange={(e) => set({ galleryText: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Publishing">
        <Field label="Display order" hint="Lower numbers appear first. This is not stock." htmlFor="offer-order">
          <Input id="offer-order" inputMode="numeric" value={value.displayOrder} onChange={(e) => set({ displayOrder: e.target.value })} />
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={value.flagship}
            onChange={(e) => set({ flagship: e.target.checked })}
            className="size-4 accent-[var(--color-pine)]"
          />
          Flagship offer (homepage). Setting this unsets the previous flagship.
        </label>
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
