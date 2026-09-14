import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { OfferCommercialTerms } from "@/components/offer-commercial-terms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type PropertyOffer, isBookable, isSoldOut, resolveMediaSrc } from "@/lib/offers";
import { cn } from "@/lib/utils";

export function PropertyCard({
  offer,
  className,
}: {
  offer: PropertyOffer;
  className?: string;
}) {
  const soldOut = isSoldOut(offer);
  return (
    <article
      className={cn(
        "flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)] transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[var(--shadow-card-hover)]",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={resolveMediaSrc(offer.image)}
          alt={offer.title}
          className="size-full object-cover"
        />
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
          <Badge tone="cream">{offer.category}</Badge>
          {offer.flagship ? <Badge tone="pine">Flagship</Badge> : null}
        </div>
        <div className="absolute bottom-3 right-3">
          <Badge tone={isBookable(offer.status) && !soldOut ? "pine" : "cream"}>
            {soldOut ? "Sold out" : isBookable(offer.status) ? "Available" : offer.status === "closed" ? "Closed" : "Coming soon"}
          </Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-1.5">
          <h3 className="min-w-0 font-display text-xl font-semibold tracking-tight text-pretty text-ink">
            {offer.title}
          </h3>
          {offer.location ? (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-3.5" aria-hidden="true" />
              {offer.location}
            </p>
          ) : null}
        </div>
        <div className="mt-auto border-t border-line pt-3">
          <OfferCommercialTerms offer={offer} variant="public" compact />
        </div>
        <Button asChild variant="secondary" className="w-full">
          <Link to="/properties/$slug" params={{ slug: offer.slug }}>
            View details
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function FeaturedOffer({ offer }: { offer: PropertyOffer }) {
  const canBook = isBookable(offer.status);
  const soldOut = isSoldOut(offer);

  return (
    <article className="grid min-w-0 overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)] md:grid-cols-[1.35fr_1fr]">
      <div className="relative overflow-hidden bg-mist md:min-h-[28rem]">
        <img
          src={resolveMediaSrc(offer.heroImage ?? offer.image)}
          alt={offer.title}
          className="aspect-[16/10] size-full object-cover md:absolute md:inset-0 md:aspect-auto"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge tone="cream">{offer.category}</Badge>
          <Badge tone={canBook && !soldOut ? "pine" : "cream"}>
            {soldOut ? "Sold out" : canBook ? "Currently available" : offer.status === "closed" ? "Closed" : "Coming soon"}
          </Badge>
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6 lg:p-8">
        {offer.location ? (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-3.5" aria-hidden="true" />
            {offer.location}
          </p>
        ) : null}
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-[1.75rem] lg:text-3xl">
          {offer.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{offer.summary}</p>
        <p className="mt-2 text-xs text-subtle">Figures below belong to this offer only.</p>
        <div className="mt-5">
          <OfferCommercialTerms offer={offer} variant="public" />
        </div>
        <div className="mt-6 flex flex-col gap-3 lg:flex-row">
          {canBook ? (
            <Button asChild className="w-full lg:flex-1">
              <Link to="/contact" search={{ intent: "book", offer: offer.slug }}>
                Request to Book
              </Link>
            </Button>
          ) : (
            <Button className="w-full lg:flex-1" disabled>
              {offer.status === "closed" ? "Closed" : "Coming soon"}
            </Button>
          )}
          <Button asChild variant="secondary" className="w-full lg:flex-1">
            <Link to="/properties/$slug" params={{ slug: offer.slug }}>
              View details
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
