import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { FileText, MapPin } from "lucide-react";
import { OfferAvailabilityNote, OfferCommercialTerms } from "@/components/offer-commercial-terms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fromApiOffer, getOffer, isBookable, isSoldOut, offerImages } from "@/lib/offers";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/properties/$slug")({
  loader: async ({ params }) => {
    try {
      const { offer } = await api.offer(params.slug);
      return { offer: fromApiOffer(offer) };
    } catch {
      const fallback = getOffer(params.slug);
      if (!fallback) throw notFound();
      return { offer: fallback };
    }
  },
  component: PropertyDetail,
});

function PropertyDetail() {
  const { offer } = Route.useLoaderData();
  const images = offerImages(offer);
  const hero = images[0];
  const rest = images.slice(1);
  const bookable = isBookable(offer.status);
  const soldOut = isSoldOut(offer);

  return (
    <div className="pb-16 pt-20 md:pt-24">
      <section className="container-pg grid min-w-0 gap-8 py-8 lg:grid-cols-[1.2fr_.8fr] lg:py-12">
        <div className="min-w-0">
          {hero ? (
            <img
              src={hero}
              alt={offer.heroImageAlt || offer.imageAlt || offer.title}
              className="aspect-[16/10] w-full rounded-2xl object-cover object-center"
            />
          ) : null}
          {rest.length === 1 ? (
            <img
              src={rest[0]}
              alt={`${offer.title} interior`}
              className="mt-4 aspect-[16/10] w-full rounded-xl object-cover object-center sm:aspect-[4/3]"
            />
          ) : null}
          {rest.length > 1 ? (
            <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
              {rest.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt={`${offer.title} view ${i + 2}`}
                  className="aspect-[4/3] w-full min-w-0 rounded-xl object-cover object-center"
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-wrap gap-2">
            <Badge>{offer.category}</Badge>
            {offer.flagship ? <Badge tone="pine">Flagship</Badge> : null}
            <Badge tone={bookable && !soldOut ? "pine" : "cream"}>
              {soldOut ? "Sold out" : bookable ? "Available" : offer.status === "closed" ? "Closed" : "Coming soon"}
            </Badge>
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold text-pretty sm:text-4xl">{offer.title}</h1>
          {offer.location ? (
            <p className="mt-2 flex min-w-0 items-center gap-2 text-sm text-muted">
              <MapPin className="size-4 shrink-0" />
              <span className="min-w-0">{offer.location}</span>
            </p>
          ) : null}
          <p className="mt-5 leading-relaxed text-muted text-pretty">{offer.summary}</p>
          <div className="mt-6 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
            <OfferCommercialTerms offer={offer} variant="public" />
            <OfferAvailabilityNote offer={offer} />
          </div>
          <PropertyCta slug={offer.slug} bookable={bookable} soldOut={soldOut} />
        </div>
      </section>
      <section className="border-y border-line bg-cream section-y">
        <div className="container-pg grid gap-5 md:grid-cols-2">
          <Info title="What is being acquired?">
            {offer.details ||
              `This offer is presented as ${offer.title}. Darmelk does not add ownership, deed, stay, rental-return, or operator-right claims beyond approved offer materials.`}
          </Info>
          {offer.features?.length ? (
            <Info title="Features">
              {offer.features.join(" · ")}
            </Info>
          ) : null}
          <Info title="Documents" icon>
            <span>
              Approved property materials for this opportunity are presented here. Booking records and payment evidence,
              when created, remain connected to the related transaction.
            </span>
          </Info>
          <Info title="Next steps">
            Request to Book is an enquiry. Darmelk reviews the request and contacts you about the property and any
            following steps. It does not confirm a booking or reserve the property.
          </Info>
        </div>
      </section>
      <section className="section-y">
        <div className="container-pg grid min-w-0 gap-8 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">How to continue</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-pretty">From enquiry to a Darmelk conversation</h2>
            <ol className="mt-6 space-y-3">
              {["Review the property", "Request to Book", "Darmelk contacts you", "Discuss next steps"].map((s, i) => (
                <li key={s} className="flex min-w-0 items-center gap-4 rounded-xl bg-cream p-4">
                  <span className="shrink-0 font-display text-xl text-pine">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 font-medium">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">Terms</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-pretty">Review before you continue</h2>
            <div className="mt-6 rounded-2xl bg-cream p-6 text-sm leading-relaxed text-muted">
              <p>
                A Request to Book tells Darmelk you are interested in this property. It is not a confirmed booking, a
                reservation, or a payment.
              </p>
              <p className="mt-4">
                Published property values shown here are the current approved terms for this opportunity.
              </p>
              <div className="mt-5 flex flex-wrap gap-4">
                <Link to="/terms" className="font-medium text-pine hover:underline">
                  Terms
                </Link>
                <Link to="/contact" className="font-medium text-pine hover:underline">
                  Contact Darmelk
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PropertyCta({ slug, bookable, soldOut }: { slug: string; bookable: boolean; soldOut: boolean }) {
  const { user } = useCurrentUserState();
  const { data: me } = useAsync(() => api.me(), [user?.id], { enabled: Boolean(user) });
  const active = me?.member.activation_status === "active";

  if (!bookable) {
    return (
      <Button className="mt-6 w-full" disabled>
        Booking closed
      </Button>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <Button asChild className="w-full">
        <Link to="/contact" search={{ intent: "book", offer: slug }}>
          Request to Book
        </Link>
      </Button>
      {soldOut ? (
        <Button className="w-full" disabled>
          Sold out
        </Button>
      ) : active ? (
        <Button asChild variant="secondary" className="w-full">
          <Link to="/app/book/$slug" params={{ slug }}>
            Start booking
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function Info({ title, children, icon = false }: { title: string; children: React.ReactNode; icon?: boolean }) {
  return (
    <article className="min-w-0 rounded-2xl bg-paper p-6">
      {icon ? <FileText className="mb-4 size-5 text-pine" /> : null}
      <h2 className="font-display text-xl font-semibold text-pretty">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">{children}</p>
    </article>
  );
}
