import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { AmountRow } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBdt, type PropertyOffer } from "@/lib/offers";
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
        <dl className="mt-auto grid grid-cols-1 gap-3 border-t border-line pt-4 min-[400px]:grid-cols-3 min-[400px]:gap-2">
          <div className="flex items-baseline justify-between gap-3 min-[400px]:block">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              Retail
            </dt>
            <dd className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink min-[400px]:mt-1">
              {formatBdt(offer.retailValue)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 min-[400px]:block">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              Booking
            </dt>
            <dd className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink min-[400px]:mt-1">
              {formatBdt(offer.bookingAmount)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 min-[400px]:block">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              Benefit
            </dt>
            <dd className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink min-[400px]:mt-1">
              {formatBdt(offer.qualificationBenefit)}
            </dd>
          </div>
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
          <dl className="mt-6 space-y-4">
            <AmountRow label="Retail value" value={offer.retailValue} />
            <AmountRow label="Booking amount" value={offer.bookingAmount} />
            <AmountRow label="Qualification benefit" value={offer.qualificationBenefit} />
          </dl>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="sm:flex-1">
            <Link to="/properties/$slug" params={{ slug: offer.slug }}>
              View details
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}