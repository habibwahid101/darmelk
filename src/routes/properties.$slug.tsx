import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { AmountRow } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOffer } from "@/lib/offers";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/properties/$slug")({
  loader: ({ params }) => {
    const offer = getOffer(params.slug);
    if (!offer) throw notFound();
    return { offer };
  },
  component: PropertyDetail,
});

function PropertyDetail() {
  const { offer } = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  const canBook = offer.status === "available";

  return (
    <div className="container-pg grid gap-8 py-10 lg:grid-cols-[1.25fr_1fr] lg:py-14">
        <div className="overflow-hidden rounded-2xl bg-mist">
          <img
            src={offer.heroImage ?? offer.image}
            alt={offer.title}
            className="aspect-[16/11] w-full object-cover"
          />
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-wrap gap-2">
            <Badge>{offer.category}</Badge>
            {offer.flagship ? <Badge tone="pine">Flagship</Badge> : null}
            <Badge tone="pine">
              {offer.status === "available" ? "Available" : "Coming soon"}
            </Badge>
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            {offer.title}
          </h1>
          {offer.location ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-3.5" />
              {offer.location}
            </p>
          ) : null}
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{offer.summary}</p>
          <p className="mt-3 text-sm text-muted">Figures below are specific to this offer.</p>
          <dl className="mt-6 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
            <AmountRow label="Retail value" value={offer.retailValue} />
            <AmountRow label="Booking amount" value={offer.bookingAmount} />
            <AmountRow label="Qualification benefit" value={offer.qualificationBenefit} />
          </dl>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {canBook ? (
              isPending ? (
                <Button className="sm:flex-1" disabled>
                  Start booking
                </Button>
              ) : user ? (
                <Button asChild className="sm:flex-1">
                  <Link to="/app/book/$slug" params={{ slug: offer.slug }}>
                    Start booking
                  </Link>
                </Button>
              ) : (
                <Button asChild className="sm:flex-1">
                  <Link to="/login" search={{ intent: "book", offer: offer.slug }}>
                    Start booking
                  </Link>
                </Button>
              )
            ) : (
              <Button className="sm:flex-1" disabled>
                Coming soon
              </Button>
            )}
            <Button asChild variant="ghost" className="sm:flex-1">
              <Link to="/" hash="how-it-works">
                How it works
              </Link>
            </Button>
          </div>
        </div>
    </div>
  );
}