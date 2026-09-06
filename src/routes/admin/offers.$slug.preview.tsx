import { createFileRoute, Link } from "@tanstack/react-router";
import { FeaturedOffer } from "@/components/property-card";
import { AmountRow, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { formatBdt, fromApiOffer, offerImages } from "@/lib/offers";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/offers/$slug/preview")({ component: AdminOfferPreview });

function AdminOfferPreview() {
  const { slug } = Route.useParams();
  const { data, loading, error } = useAsync(() => api.admin.offer(slug), [slug]);
  const offer = data?.offer ? fromApiOffer(data.offer) : undefined;
  const images = offer ? offerImages(offer) : [];

  if (loading && !offer) return <p className="text-sm text-muted">Loading preview…</p>;
  if (error || !offer) return <p className="text-sm text-clay">{error?.message ?? "Offer not found."}</p>;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Preview"
        title={offer.title}
        description="Admin preview uses the current saved offer. Drafts stay hidden from the public site."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/admin/offers/$slug" params={{ slug }}>
                Edit
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/admin/offers">All offers</Link>
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge>{offer.status}</Badge>
        <Badge>{offer.category}</Badge>
        {offer.flagship ? <Badge tone="pine">Flagship</Badge> : null}
      </div>
      <FeaturedOffer offer={offer} />
      {images.length > 1 ? (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
          {images.slice(1).map((src) => (
            <img key={src} src={src} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
          ))}
        </div>
      ) : null}
      <dl className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
        <AmountRow label="Retail value" value={offer.retailValue} />
        <AmountRow label="Booking amount" value={offer.bookingAmount} />
        <AmountRow label="Qualification benefit" value={offer.qualificationBenefit} />
        <AmountRow label="Commission-eligible" value={offer.commissionEligibleAmount ?? offer.bookingAmount} />
      </dl>
      {offer.details ? <p className="max-w-3xl text-sm leading-relaxed text-muted">{offer.details}</p> : null}
      {offer.features?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {offer.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-subtle">Preview figures: {formatBdt(offer.bookingAmount)} booking for this offer only.</p>
    </div>
  );
}
