import { createFileRoute, Link } from "@tanstack/react-router";
import { FeaturedOffer, PropertyCard } from "@/components/property-card";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, OFFERS, offersInCategory } from "@/lib/offers";
import { cn } from "@/lib/utils";

type PropertiesSearch = { category?: string };

export const Route = createFileRoute("/properties/")({
  validateSearch: (s: Record<string, unknown>): PropertiesSearch => ({
    category: typeof s.category === "string" ? s.category : undefined,
  }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const { category } = Route.useSearch();
  const list = category ? offersInCategory(category) : OFFERS;
  const active = CATEGORIES.find((c) => c.slug === category);

  return (
    <>
      <section className="container-pg pb-8 pt-10 md:pt-14">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">
          Properties
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
          Property opportunities
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          Review the currently published property opportunity and its approved terms.
        </p>
      </section>

      <section className="pb-10">
        <div className="container-pg">
          <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max gap-2 pb-1">
              <FilterChip to="/properties" active={!category}>
                All available
              </FilterChip>
              {CATEGORIES.filter((c) => c.available).map((c) => (
                <FilterChip
                  key={c.slug}
                  to="/properties"
                  search={{ category: c.slug }}
                  active={category === c.slug}
                  disabled={!c.available}
                >
                  {c.title}
                  {!c.available ? " · Soon" : ""}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-pg pb-20">
        {list.length > 0 ? (
          list.length === 1 ? (
            <FeaturedOffer offer={list[0]} />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {list.map((offer) => (
                <PropertyCard key={offer.slug} offer={offer} />
              ))}
            </div>
          )
        ) : (
          <div className="rounded-2xl bg-cream px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <Badge>{active?.available ? "No offers" : "Coming soon"}</Badge>
            <p className="mt-4 font-display text-2xl font-semibold">
              {active?.title ?? "This category"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              {active?.blurb ?? "No published offers in this category yet."}
            </p>
            <Link
              to="/properties"
              className="mt-6 inline-flex text-sm font-medium text-pine hover:underline"
            >
              View available offers
            </Link>
          </div>
        )}
      </section>
    </>
  );
}

function FilterChip({
  children,
  to,
  search,
  active,
  disabled,
}: {
  children: React.ReactNode;
  to: "/properties";
  search?: PropertiesSearch;
  active?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-11 shrink-0 items-center rounded-full bg-mist px-4 text-sm text-subtle">
        {children}
      </span>
    );
  }
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-pine text-pine-fg"
          : "bg-cream text-ink shadow-[0_0_0_1px_rgb(40_33_30/0.08)] hover:bg-mist",
      )}
    >
      {children}
    </Link>
  );
}
