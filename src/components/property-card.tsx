import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
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
        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-4">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              Retail
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
              {formatBdt(offer.retailValue)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              Booking
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
              {formatBdt(offer.bookingAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              Benefit
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
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
