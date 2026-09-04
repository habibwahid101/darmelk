import { Link } from "@tanstack/react-router";
import * as Accordion from "@radix-ui/react-accordion";
import { ArrowRight, ChevronDown, FileText, Scale, ShieldCheck } from "lucide-react";
import { AmountRow } from "@/components/states";
import { Button } from "@/components/ui/button";
import { FLAGSHIP, OFFERS } from "@/lib/offers";

const propertyCategories = [
  {
    title: "Hotel & Resort Shares",
    slug: "hotel-resort-shares",
    image: "/images/category-resort.jpg",
  },
  {
    title: "Land & Plots",
    slug: "land-plots",
    image: "/images/category-land.jpg",
  },
  {
    title: "Flats & Apartments",
    slug: "apartments",
    image: "/images/category-apt.jpg",
  },
  {
    title: "Commercial Properties",
    slug: "commercial-properties",
    image: "/images/category-commercial.jpg",
  },
] as const;

const steps = [
  ["01", "Create your account", "Create your Darmelk member profile."],
  ["02", "Activate your ID", "Pay the annual BDT 1,000 activation fee and receive approval."],
  ["03", "Choose and book your property", "Review the property, submit payment evidence, and receive booking confirmation."],
  ["04", "Build your progress", "Personally sponsor 3 and progress through five levels to meet qualification conditions."],
];
const faqs = [
  ["What is Darmelk?", "Darmelk is a property-first platform where property terms, bookings, payments, progress, and financial activity are recorded."],
  ["How do I start?", "Create an account, complete your profile, pay the annual BDT 1,000 activation fee, and wait for admin approval before booking."],
  ["What are the qualification conditions?", "Personally sponsor 3 eligible members and complete Level 5. Full details are available in Program Rules."],
  ["Are commission and the property benefit the same?", "No. Commission is calculated from actual eligible confirmed booking amounts. The qualification benefit belongs to your own booked offer."],
];

export function LandingPage() {
  return (
    <div>
      <section className="relative min-h-[78svh] overflow-hidden bg-ink">
        <img
          src="/images/hero-platform.jpg"
          alt="Darmelk property opportunities across hospitality, residential, land, and commercial"
          className="absolute inset-0 size-full object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(40_33_30/.88),rgb(40_33_30/.42)_55%,rgb(40_33_30/.22))]" />
        <div className="container-pg relative flex min-h-[78svh] items-end py-16 pt-28 md:items-center md:py-24">
          <div className="max-w-2xl text-cream">
            <p className="text-xs font-medium uppercase tracking-[.2em] text-cream/70">Your property gateway</p>
            <h1 className="mt-4 font-display text-[2.05rem] font-semibold leading-[1.18] tracking-tight text-pretty sm:text-5xl sm:leading-[1.12] md:text-6xl md:leading-[1.08]">
              Explore Property Opportunities{" "}
              <span className="md:block">with Clarity and Confidence.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-cream/80 text-pretty md:text-base">
              Discover carefully presented property opportunities with clear terms, documented activity, and a straightforward path from exploration to booking.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="invert" size="lg">
                <a href="#explore-properties">
                  Explore Properties <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button asChild variant="invertGhost" size="lg">
                <a href="#how-it-works">How Darmelk Works</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="container-pg grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
          <img src={FLAGSHIP.image} alt={FLAGSHIP.title} className="aspect-[16/11] w-full rounded-2xl object-cover" />
          <div>
            <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">Flagship property</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-pretty">{FLAGSHIP.title}</h2>
            <p className="mt-2 text-sm text-muted">
              {FLAGSHIP.location} · {FLAGSHIP.category}
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-muted text-pretty">{FLAGSHIP.summary}</p>
            <dl className="mt-6 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <AmountRow label="Property value" value={FLAGSHIP.retailValue} />
              <AmountRow label="Initial booking" value={FLAGSHIP.bookingAmount} />
              <AmountRow label="Qualification benefit" value={FLAGSHIP.qualificationBenefit} />
            </dl>
            <Button asChild className="mt-6 w-full">
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                View Details
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="explore-properties" className="border-y border-line bg-cream py-10 md:py-12">
        <div className="container-pg">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">Categories</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-pretty">Explore Properties</h2>
            <p className="mt-2 text-sm text-muted text-pretty">Discover property opportunities across different categories.</p>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {propertyCategories.map((category) => {
              const availableCount = OFFERS.filter(
                (offer) => offer.categorySlug === category.slug && offer.status === "available",
              ).length;
              const inner = (
                <>
                  <div className="aspect-[4/3] overflow-hidden">
                    <img src={category.image} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg font-semibold text-pretty">{category.title}</h3>
                    <p className={availableCount > 0 ? "mt-2 text-sm font-medium text-pine" : "mt-2 text-sm text-subtle"}>
                      {availableCount === 1
                        ? "1 Property Available"
                        : availableCount > 1
                          ? `${availableCount} Properties Available`
                          : "Coming Soon"}
                    </p>
                  </div>
                </>
              );
              return availableCount > 0 ? (
                <Link
                  key={category.slug}
                  to="/properties"
                  search={{ category: category.slug }}
                  className="group overflow-hidden rounded-2xl bg-paper shadow-[var(--shadow-card)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"
                >
                  {inner}
                </Link>
              ) : (
                <article key={category.slug} aria-disabled="true" className="overflow-hidden rounded-2xl border border-line bg-paper/65">
                  {inner}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b border-line bg-cream section-y">
        <div className="container-pg">
          <Heading kicker="Journey" title="How Darmelk works" />
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map(([n, title, body]) => (
              <li key={n} className="rounded-2xl bg-paper p-6">
                <p className="font-display text-2xl text-pine">{n}</p>
                <h3 className="mt-3 font-display text-xl font-semibold text-pretty">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-center text-sm">
            <Link to="/program-rules" className="font-medium text-pine hover:underline">
              See qualification details
            </Link>
          </p>
        </div>
      </section>

      <section className="section-y">
        <div className="container-pg">
          <Heading kicker="Why Darmelk" title="Clear Property Terms. Documented Activity." />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Trust icon={Scale} title="Clear Property Terms">
              Offer-specific values and booking conditions are shown before you continue.
            </Trust>
            <Trust icon={FileText} title="Documented Transactions">
              Payment, booking, and financial activity remain connected to your member record.
            </Trust>
            <Trust icon={ShieldCheck} title="Transparent Qualification">
              Property benefit and commission remain separate and traceable.
            </Trust>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-cream section-y">
        <div className="container-pg grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">Documentation</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-pretty">Records connected to your booking</h2>
            <p className="mt-4 leading-relaxed text-muted text-pretty">
              Property-related information, booking records, payment evidence, and transaction history are connected to the member’s booking. Sensitive records remain available through the authenticated member area.
            </p>
          </div>
          <div className="rounded-2xl bg-paper p-6">
            <p className="font-medium">Before booking</p>
            <p className="mt-2 text-sm text-muted text-pretty">
              Review property values, the booking process, payment terms, qualification summary, and applicable program rules.
            </p>
            <Button asChild variant="secondary" className="mt-5">
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                Review property
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="faq" className="section-y">
        <div className="container-pg max-w-3xl">
          <Heading kicker="FAQ" title="Clear answers before you continue" />
          <Accordion.Root type="single" collapsible className="mt-9 divide-y divide-line rounded-2xl bg-cream px-5">
            {faqs.map(([q, a], i) => (
              <Accordion.Item value={`q-${i}`} key={q}>
                <Accordion.Header>
                  <Accordion.Trigger className="flex w-full items-center justify-between gap-4 py-5 text-left font-medium">
                    {q}
                    <ChevronDown className="size-4 shrink-0" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="pb-5 text-sm leading-relaxed text-muted">{a}</Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
          <p className="mt-5 text-center text-sm">
            <Link to="/faq" className="font-medium text-pine hover:underline">
              View full FAQ and program mechanics
            </Link>
          </p>
        </div>
      </section>

      <section className="bg-pine py-14 text-pine-fg">
        <div className="container-pg flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold text-pretty">Explore the property</h2>
            <p className="mt-2 text-sm text-pine-fg/75 text-pretty">Review the offer and create your account when you are ready.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="invert">
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                View Property
              </Link>
            </Button>
            <Button asChild variant="invertGhost">
              <Link to="/login" search={{ mode: "create" }}>
                Create Account
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Heading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">{kicker}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold text-pretty md:text-4xl">{title}</h2>
    </div>
  );
}
function Trust({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Scale;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl bg-cream p-6">
      <Icon className="size-5 text-pine" />
      <h3 className="mt-4 font-display text-xl font-semibold text-pretty">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">{children}</p>
    </article>
  );
}
