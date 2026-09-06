import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { FileText, MapPin } from "lucide-react";
import { AmountRow } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOffer, offerImages } from "@/lib/offers";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

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
  const { data: me } = useAsync(() => api.me(), [user?.id], { enabled: Boolean(user) });
  const active = me?.member.activation_status === "active";
  const images = offerImages(offer);
  const hero = images[0];
  const rest = images.slice(1);

  return (
    <main className="pb-16 pt-20 md:pt-24">
      <section className="container-pg grid min-w-0 gap-8 py-8 lg:grid-cols-[1.2fr_.8fr] lg:py-12">
        <div className="min-w-0">
          {hero ? (
            <img
              src={hero}
              alt={offer.title}
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
            <Badge tone="pine">Available</Badge>
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold text-pretty sm:text-4xl">{offer.title}</h1>
          {offer.location ? (
            <p className="mt-2 flex min-w-0 items-center gap-2 text-sm text-muted">
              <MapPin className="size-4 shrink-0" />
              <span className="min-w-0">{offer.location}</span>
            </p>
          ) : null}
          <p className="mt-5 leading-relaxed text-muted text-pretty">{offer.summary}</p>
          <dl className="mt-6 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
            <AmountRow label="Property/share value" value={offer.retailValue} />
            <AmountRow label="Booking amount" value={offer.bookingAmount} />
            <AmountRow label="Qualification benefit" value={offer.qualificationBenefit} />
          </dl>
          <StateCta pending={isPending} user={Boolean(user)} active={active} slug={offer.slug} />
        </div>
      </section>
      <section className="border-y border-line bg-cream section-y">
        <div className="container-pg grid gap-5 md:grid-cols-2">
          <Info title="What is being acquired?">
            This offer is presented as a Five-Star Hotel Share. Darmelk does not add ownership, deed, stay,
            rental-return, or operator-right claims beyond approved offer materials.
          </Info>
          <Info title="Benefits">
            The approved qualification benefit for this booked offer is BDT 600,000 after the program
            qualification conditions are met. It is separate from commission.
          </Info>
          <Info title="Documents" icon>
            <span>
              Property and booking records are connected to the member’s booking. Sensitive files, when
              available, are shown in the authenticated Documents area.
            </span>
          </Info>
          <Info title="Qualification">
            Personally sponsor 3 eligible members and complete through Level 5.{" "}
            <Link to="/program-rules" className="font-medium text-pine hover:underline">
              Read full rules
            </Link>
            .
          </Info>
        </div>
      </section>
      <section className="section-y">
        <div className="container-pg grid min-w-0 gap-8 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">Booking process</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-pretty">From active ID to confirmed booking</h2>
            <ol className="mt-6 space-y-3">
              {["Active ID", "Start Booking", "Manual Payment", "Proof Submission", "Admin Verification", "Confirmed Booking"].map(
                (s, i) => (
                  <li key={s} className="flex min-w-0 items-center gap-4 rounded-xl bg-cream p-4">
                    <span className="shrink-0 font-display text-xl text-pine">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 font-medium">{s}</span>
                  </li>
                ),
              )}
            </ol>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">Payment, cancellation and terms</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-pretty">Review before you book</h2>
            <div className="mt-6 rounded-2xl bg-cream p-6 text-sm leading-relaxed text-muted">
              <p>
                Booking payment is manual and does not become approved when submitted. An admin verifies the
                transaction reference and payment proof.
              </p>
              <p className="mt-4">
                Booking values are frozen from this offer. Cancellation, rejection, reversal, payment, and audit
                records remain recorded according to current program behavior.
              </p>
              <div className="mt-5 flex flex-wrap gap-4">
                <Link to="/terms" className="font-medium text-pine hover:underline">
                  Terms
                </Link>
                <Link to="/program-rules" className="font-medium text-pine hover:underline">
                  Program Rules
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StateCta({
  pending,
  user,
  active,
  slug,
}: {
  pending: boolean;
  user: boolean;
  active: boolean;
  slug: string;
}) {
  if (pending)
    return (
      <Button className="mt-6 w-full" disabled>
        Checking account…
      </Button>
    );
  if (!user)
    return (
      <Button asChild className="mt-6 w-full">
        <Link to="/login" search={{ intent: "book", offer: slug, mode: "create" }}>
          Create Account to Continue
        </Link>
      </Button>
    );
  if (!active)
    return (
      <Button asChild className="mt-6 w-full">
        <Link to="/app/activation">Activate Your ID</Link>
      </Button>
    );
  return (
    <Button asChild className="mt-6 w-full">
      <Link to="/app/book/$slug" params={{ slug }}>
        Start Booking
      </Link>
    </Button>
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
