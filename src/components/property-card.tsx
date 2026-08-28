import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { AmountRow } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type PropertyOffer } from "@/lib/offers";
import { cn } from "@/lib/utils";

export function PropertyCard({
  offer,
  className,
}: {
  offer: PropertyOffer;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)] transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[var(--shadow-card-hover)]",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={offer.image}
          alt={offer.title}
          className="size-full object-cover"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge tone="cream">{offer.category}</Badge>
          {offer.flagship ? <Badge tone="pine">Flagship</Badge> : null}
        </div>
        <div className="absolute bottom-3 right-3">
          <Badge tone={offer.status === "available" ? "pine" : "cream"}>
            {offer.status === "available" ? "Available" : "Coming soon"}
          </Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-1.5">
          <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
            {offer.title}
          </h3>
          {offer.location ? (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-3.5" aria-hidden="true" />
              {offer.location}
            </p>
          ) : null}
        </div>
        <dl className="mt-auto border-t border-line pt-3">
          <AmountRow compact label="Retail" value={offer.retailValue} />
          <AmountRow compact label="Booking" value={offer.bookingAmount} />
          <AmountRow compact label="Benefit" value={offer.qualificationBenefit} />
        </dl>
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
  return (
    <article className="grid overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)] lg:grid-cols-[1.35fr_1fr]">
      <div className="relative overflow-hidden bg-mist">
        <img
          src={offer.heroImage ?? offer.image}
          alt={offer.title}
          className="aspect-[16/10] size-full object-cover lg:aspect-auto lg:min-h-[22rem]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge tone="cream">{offer.category}</Badge>
          {offer.flagship ? <Badge tone="pine">Flagship</Badge> : null}
        </div>
      </div>
      <div className="flex flex-col justify-between p-6 md:p-8">
        <div>
          {offer.location ? (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-3.5" aria-hidden="true" />
              {offer.location}
            </p>
          ) : null}
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {offer.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">{offer.summary}</p>
          <p className="mt-2 text-xs text-subtle">Figures below belong to this offer only.</p>
          <dl className="mt-5">
            <AmountRow label="Retail value" value={offer.retailValue} />
            <AmountRow label="Booking amount" value={offer.bookingAmount} />
            <AmountRow label="Qualification benefit" value={offer.qualificationBenefit} />
          </dl>
        </div>
        <div className="mt-6">
          <Button asChild className="w-full">
            <Link to="/properties/$slug" params={{ slug: offer.slug }}>
              View details
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}