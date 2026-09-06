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
  image: string;
  heroImage: string;
  galleryText: string;
  flagship: boolean;
  displayOrder: string;
};

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
        <p className="text-sm text-muted">These amounts belong to this offer only. Existing bookings keep their original snapshot.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Retail value (BDT)" htmlFor="offer-retail">
            <Input id="offer-retail" inputMode="numeric" value={value.retailValue} onChange={(e) => set({ retailValue: e.target.value })} required />
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
        <Field label="Display order" hint="Lower numbers appear first." htmlFor="offer-order">
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
