import { Link } from "@tanstack/react-router";
import * as Accordion from "@radix-ui/react-accordion";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  FileText,
  Landmark,
  Layers3,
  Scale,
  ShieldCheck,
  Sprout,
  Wallet,
} from "lucide-react";
import { PropertyCard } from "@/components/property-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CATEGORIES,
  COMMISSION_LEVELS,
  FLAGSHIP,
  OFFERS,
  TOTAL_POSITIONS,
  exampleCommission,
  formatBdt,
} from "@/lib/offers";
import { cn } from "@/lib/utils";

const TRUST = [
  {
    title: "Multiple property opportunities",
    body: "Hotel-share, land, residential, and future eligible offers in one place.",
  },
  {
    title: "Transparent booking terms",
    body: "Retail value, booking amount, and benefit are shown on every offer.",
  },
  {
    title: "Unified 3×5 progress",
    body: "One progress structure across eligible offers — Sponsor 3, then complete five levels.",
  },
  {
    title: "Offer-specific benefits",
    body: "Your qualification benefit is tied to the offer you booked — not someone else’s.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Choose a property",
    body: "Browse curated offers. Review retail value, booking amount, and the benefit attached to that offer.",
  },
  {
    n: "02",
    title: "Book your offer",
    body: "Start with a defined booking amount. Terms are offer-specific and visible before you confirm.",
  },
  {
    n: "03",
    title: "Build your 3×5 progress",
    body: "Personally sponsor 3, then complete five levels of progression across 363 positions in total.",
  },
  {
    n: "04",
    title: "Qualify for your property benefit",
    body: "Qualification unlocks the benefit on your own booked offer — separate from any commission earned.",
  },
];

const LEVELS = [
  { label: "Level 1", count: 3 },
  { label: "Level 2", count: 9 },
  { label: "Level 3", count: 27 },
  { label: "Level 4", count: 81 },
  { label: "Level 5", count: 243 },
];

const PILLARS = [
  {
    icon: Scale,
    title: "Offer-specific pricing",
    body: "Each offer publishes its own retail value, booking amount, and benefit. Nothing is assumed globally.",
  },
  {
    icon: FileText,
    title: "Historical booking snapshot",
    body: "Confirmed bookings stay on record so progress and commission can be reviewed against actual amounts.",
  },
  {
    icon: Layers3,
    title: "Transparent progress",
    body: "Direct sponsors and 3×5 level progress are visible in one member view — no hidden trees.",
  },
  {
    icon: Wallet,
    title: "Separate commission & benefit",
    body: "Commission is paid from confirmed booking amounts. Property benefit is a different outcome, tied to your offer.",
  },
  {
    icon: ShieldCheck,
    title: "Auditable transactions",
    body: "Booking, commission, and benefit are tracked as distinct movements so each can be explained on its own.",
  },
];

const FAQS = [
  {
    q: "What is Property Gateway?",
    a: "A property-first platform where you can explore curated offers, book with a defined amount, and progress toward that offer’s qualification benefit.",
  },
  {
    q: "What does the booking amount cover?",
    a: "The booking amount is the confirmed sum attached to a specific offer. It is not the full retail value, and it is the base used for commission on that booking.",
  },
  {
    q: "Do I immediately own the full property or share?",
    a: "No. Booking reserves your place on that offer. Full qualification benefit is earned by completing the required progress on your own booked offer.",
  },
  {
    q: "What does Sponsor 3 mean?",
    a: "You personally introduce three members who confirm eligible bookings. That is the direct-sponsor requirement before Level 1–5 progress is complete.",
  },
  {
    q: "How does Level 5 qualification work?",
    a: "Qualification requires 3 personal sponsors and a complete 3×5 structure: Level 1 = 3, Level 2 = 9, Level 3 = 27, Level 4 = 81, Level 5 = 243. Across Levels 1–5 there are 363 positions. Level 5 itself is 243 — 363 is the total, not Level 5.",
  },
  {
    q: "How is commission calculated?",
    a: "Commission is a percentage of each eligible source member’s actual confirmed booking amount: L1 10%, L2 8%, L3 6%, L4 4%, L5 2%. It is never assumed from a single global figure.",
  },
  {
    q: "Can network members book different offers?",
    a: "Yes. Cross-offer sponsorship is supported. Someone in your network may book a different eligible offer. That does not change your own qualification benefit.",
  },
  {
    q: "What happens after qualification?",
    a: "You become eligible for the qualification benefit attached to the offer you booked. Documents and next steps appear in your member area.",
  },
  {
    q: "What happens if annual activation expires?",
    a: "Activation is required to keep member progress current. If it expires, new commission and progress may pause until activation is renewed. Existing confirmed bookings remain on record.",
  },
  {
    q: "Are booking amount, commission and property benefit separate?",
    a: "Yes. Booking amount is what you confirm on an offer. Commission is earned from others’ confirmed booking amounts. Property benefit is the qualification outcome of your own booked offer.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  light = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  light?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          "mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl",
          light ? "text-cream" : "text-ink",
        )}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={cn(
            "mx-auto mt-4 max-w-xl text-[15px] leading-relaxed",
            light ? "text-cream/75" : "text-muted",
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function LandingPage() {
  const exampleTotal = COMMISSION_LEVELS.reduce(
    (sum, row) =>
      sum + exampleCommission(FLAGSHIP.bookingAmount, row.rate, row.positions),
    0,
  );

  return (
    <div>
      <Hero />
      <TrustStrip />
      <Flagship />
      <Categories />
      <Opportunities />
      <HowItWorks />
      <Qualification />
      <Commission exampleTotal={exampleTotal} />
      <Benefit />
      <Pillars />
      <DashboardPreview />
      <Faq />
      <FinalCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-ink">
      <img
        src="/images/hero-hotel.jpg"
        alt="Five-star hotel at dusk with a still reflecting pool"
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(26_25_22/0.45)_0%,rgb(26_25_22/0.28)_40%,rgb(26_25_22/0.72)_100%)]" />
      <div className="relative container-pg flex min-h-[100svh] flex-col justify-end pb-16 pt-28 md:pb-24">
        <div className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-cream/70">
            Curated property offers
          </p>
          <h1 className="mt-4 font-display text-[2.35rem] font-semibold leading-[1.08] tracking-[-0.03em] text-cream md:text-6xl">
            Discover better property opportunities
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-cream/80 md:text-base">
            Explore curated hotel-share, resort-share, land, and future eligible
            offers. Begin with a defined booking amount and progress toward the
            benefit attached to the offer you choose.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="invert" size="lg">
              <Link to="/properties">
                Explore properties
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="invertGhost" size="lg">
              <a href="#how-it-works">How it works</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <section className="border-b border-line bg-cream">
      <div className="container-pg grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6 lg:py-12">
        {TRUST.map((item) => (
          <div key={item.title} className="min-w-0">
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Flagship() {
  return (
    <section id="properties" className="section-y scroll-mt-24">
      <div className="container-pg">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <Eyebrow>Flagship offer</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Five-Star Hotel Share
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Values below belong to this offer only. They are not universal
              Property Gateway figures.
            </p>
          </div>
          <Badge tone="pine">Currently available</Badge>
        </div>

        <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="overflow-hidden rounded-2xl bg-mist">
            <img
              src={FLAGSHIP.heroImage ?? FLAGSHIP.image}
              alt="Exterior of the flagship five-star hotel"
              className="aspect-[16/11] size-full object-cover md:aspect-[16/10]"
            />
          </div>
          <div className="flex flex-col justify-between rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)] md:p-8">
            <div>
              <p className="text-sm text-muted">
                {FLAGSHIP.category}
                {FLAGSHIP.location ? ` · ${FLAGSHIP.location}` : ""}
              </p>
              <h3 className="mt-2 font-display text-2xl font-semibold">{FLAGSHIP.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{FLAGSHIP.summary}</p>
              <dl className="mt-8 space-y-4">
                {[
                  ["Retail value", FLAGSHIP.retailValue],
                  ["Booking amount", FLAGSHIP.bookingAmount],
                  ["Qualification benefit", FLAGSHIP.qualificationBenefit],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex items-baseline justify-between gap-4 border-b border-line pb-3"
                  >
                    <dt className="text-sm text-muted">{label}</dt>
                    <dd className="text-base font-semibold tabular-nums text-ink">
                      {formatBdt(value as number)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="flex-1">
                <Link to="/login" search={{ intent: "book", offer: FLAGSHIP.slug }}>
                  Start booking
                </Link>
              </Button>
              <Button asChild variant="secondary" className="flex-1">
                <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                  View details
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Categories() {
  return (
    <section className="border-y border-line bg-cream section-y">
      <div className="container-pg">
        <SectionHeading
          eyebrow="Discover"
          title="Explore by category"
          body="Only categories with published offers are bookable. Everything else is marked coming soon — we do not list inventory that is not live."
        />
        <div className="mt-12 grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              to="/properties"
              search={cat.available ? { category: cat.slug } : undefined}
              className="group relative isolate overflow-hidden rounded-2xl"
            >
              <img
                src={cat.image}
                alt={cat.title}
                className="aspect-[4/5] w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] min-[520px]:aspect-[3/4] lg:aspect-[4/5]"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgb(26_25_22/0.78)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <Badge tone={cat.available ? "pine" : "cream"}>
                  {cat.available ? "Available" : "Coming soon"}
                </Badge>
                <p className="mt-3 font-display text-xl font-semibold text-cream">
                  {cat.title}
                </p>
                <p className="mt-1 text-sm text-cream/75">{cat.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Opportunities() {
  return (
    <section id="opportunities" className="section-y scroll-mt-24">
      <div className="container-pg">
        <SectionHeading
          eyebrow="Marketplace"
          title="Available property opportunities"
          body="Each card shows the offer’s own retail value, booking amount, and qualification benefit. Commission is not the primary content."
        />
        <div className="mx-auto mt-12 grid max-w-xl gap-6">
          {OFFERS.map((offer) => (
            <PropertyCard key={offer.slug} offer={offer} />
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted">
          Additional categories will appear here as offers are published.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-line bg-cream section-y scroll-mt-24">
      <div className="container-pg">
        <SectionHeading
          eyebrow="Journey"
          title="How Property Gateway works"
          body="Four steps. Property first — then booking, progress, and benefit."
        />
        <ol className="mt-12 grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="flex min-h-[15.5rem] flex-col rounded-2xl bg-paper p-6 shadow-[var(--shadow-card)]"
            >
              <span className="font-display text-2xl text-pine">{step.n}</span>
              <h3 className="mt-4 font-display text-xl font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Qualification() {
  return (
    <section className="section-y">
      <div className="container-pg">
        <SectionHeading
          eyebrow="Progress"
          title="The qualification journey"
          body="Network mechanics live here — after you have chosen a property. This is a progress path, not a sales tree."
        />
        <div className="mx-auto mt-12 max-w-3xl rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)] md:p-10">
          <div className="flex flex-col items-start gap-3 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
                First requirement
              </p>
              <p className="mt-1 font-display text-2xl font-semibold">
                Personally sponsor 3
              </p>
            </div>
            <p className="max-w-sm text-sm text-muted">
              Three confirmed direct bookings. Then the 3×5 structure fills
              across five levels.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {LEVELS.map((lvl) => (
              <div
                key={lvl.label}
                className="rounded-xl bg-paper px-3 py-4 text-center"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                  {lvl.label}
                </p>
                <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-ink">
                  {lvl.count}
                </p>
                <p className="mt-1 text-xs text-muted">positions</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-2 rounded-xl bg-pine px-5 py-4 text-pine-fg sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">Total across Levels 1–5</p>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {TOTAL_POSITIONS} positions
            </p>
          </div>
          <p className="mt-4 text-sm text-muted">
            Level 5 itself is 243. {TOTAL_POSITIONS} is the combined total — it
            is not a Level 5 figure.
          </p>
        </div>
      </div>
    </section>
  );
}

function Commission({ exampleTotal }: { exampleTotal: number }) {
  return (
    <section id="commission" className="border-y border-line bg-ink section-y scroll-mt-24">
      <div className="container-pg">
        <SectionHeading
          light
          eyebrow="Earnings"
          title="Earn from confirmed property bookings"
          body="Commission is calculated from each eligible source member’s actual confirmed booking amount. Rates never assume a single global booking figure."
        />
        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl bg-cream">
          <div className="grid grid-cols-3 border-b border-line px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-subtle sm:px-6">
            <span>Level</span>
            <span className="text-center">Rate</span>
            <span className="text-right">Positions</span>
          </div>
          {COMMISSION_LEVELS.map((row) => (
            <div
              key={row.level}
              className="grid grid-cols-3 items-center border-b border-line px-4 py-4 last:border-0 sm:px-6"
            >
              <span className="text-sm font-medium">L{row.level}</span>
              <span className="text-center font-display text-xl font-semibold tabular-nums">
                {Math.round(row.rate * 100)}%
              </span>
              <span className="text-right text-sm tabular-nums text-muted">
                {row.positions}
              </span>
            </div>
          ))}
        </div>
        <aside className="mx-auto mt-8 max-w-3xl rounded-2xl border border-cream/15 bg-cream/5 px-5 py-5 text-cream/85">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-cream/60">
            Example only — not a guaranteed figure
          </p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-cream">
            {formatBdt(exampleTotal)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-cream/70">
            Example: all {TOTAL_POSITIONS} eligible source bookings use{" "}
            {formatBdt(FLAGSHIP.bookingAmount)} — the Five-Star Hotel Share
            booking amount. If a source member books a different offer, commission
            uses that offer’s actual confirmed booking amount.
          </p>
        </aside>
      </div>
    </section>
  );
}

function Benefit() {
  return (
    <section id="benefits" className="section-y scroll-mt-24">
      <div className="container-pg grid items-center gap-10 lg:grid-cols-2">
        <div>
          <Eyebrow>Property benefit</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            The benefit is tied to the offer you booked
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Qualification benefit belongs to the member’s own booked offer.
            Downline members may book different eligible offers. Their choices
            do not change your benefit.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "Your booked offer sets retail, booking, and benefit.",
              "Network members can book other eligible offers.",
              "Commission and property benefit stay separate.",
            ].map((line) => (
              <li key={line} className="flex gap-3 text-sm text-ink">
                <Check className="mt-0.5 size-4 shrink-0 text-pine" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)]">
          <img
            src="/images/flagship-suite.jpg"
            alt="Suite interior of the flagship hotel share"
            className="aspect-[16/9] w-full object-cover"
          />
          <div className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
              Flagship example
            </p>
            <p className="mt-1 font-display text-2xl font-semibold">
              Five-Star Hotel Share
            </p>
            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-subtle">
                  Retail
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {formatBdt(650_000)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-subtle">
                  Booking
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {formatBdt(50_000)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-subtle">
                  Benefit
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {formatBdt(600_000)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pillars() {
  return (
    <section className="border-y border-line bg-cream section-y">
      <div className="container-pg">
        <SectionHeading
          eyebrow="Trust"
          title="Why Property Gateway"
          body="Clear terms. Separate outcomes. Nothing dressed up as urgency."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <article
              key={p.title}
              className="rounded-2xl bg-paper p-6 shadow-[var(--shadow-card)]"
            >
              <p.icon className="size-5 text-pine" strokeWidth={1.75} />
              <h3 className="mt-4 font-display text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <section className="section-y">
      <div className="container-pg">
        <SectionHeading
          eyebrow="Member area"
          title="A clear view of your progress"
          body="Bookings, sponsors, levels, commission, and documents — in one place, without package jargon."
        />
        <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <p className="text-sm font-medium">Member overview</p>
            <span className="rounded-full bg-pine/10 px-2.5 py-1 text-[11px] font-medium text-pine">
              Preview
            </span>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            <DashCell
              icon={Building2}
              label="My bookings"
              value="1 offer"
              hint="Five-Star Hotel Share"
            />
            <DashCell
              icon={Sprout}
              label="Direct sponsors"
              value="2 / 3"
              hint="One personal booking remaining"
            />
            <DashCell
              icon={Layers3}
              label="Level progress"
              value="L1 1/3"
              hint="363 positions across L1–L5"
            />
            <DashCell
              icon={Wallet}
              label="Available commission"
              value={formatBdt(0)}
              hint="Paid from confirmed booking amounts"
            />
            <DashCell
              icon={ShieldCheck}
              label="Qualification status"
              value="In progress"
              hint="Requires 3 directs + complete Level 5"
            />
            <DashCell
              icon={Landmark}
              label="Property documents"
              value="Ready after booking"
              hint="Offer terms stay attached to your booking"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function DashCell({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-cream p-5">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" strokeWidth={1.75} />
        <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
}

function Faq() {
  return (
    <section id="faq" className="border-y border-line bg-cream section-y scroll-mt-24">
      <div className="container-pg">
        <SectionHeading eyebrow="Questions" title="FAQ" />
        <Accordion.Root
          type="single"
          collapsible
          className="mx-auto mt-12 max-w-2xl divide-y divide-line rounded-2xl bg-paper px-2 shadow-[var(--shadow-card)]"
        >
          {FAQS.map((item) => (
            <Accordion.Item key={item.q} value={item.q}>
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-start justify-between gap-4 px-4 py-5 text-left">
                  <span className="text-[15px] font-medium leading-snug text-ink">
                    {item.q}
                  </span>
                  <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-none">
                <p className="px-4 pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-ink">
      <img
        src="/images/category-resort.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-ink/55" />
      <div className="relative container-pg py-20 text-center md:py-28">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-cream md:text-5xl">
          Find your property opportunity
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-cream/75">
          Browse available offers and understand the terms before booking.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild variant="invert" size="lg">
            <Link to="/properties">Explore properties</Link>
          </Button>
          <Button asChild variant="invertGhost" size="lg">
            <Link to="/login" search={{ mode: "create" }}>
              Create account
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
