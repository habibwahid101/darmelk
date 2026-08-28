import { createFileRoute, Link } from "@tanstack/react-router";
import { PropertyCard } from "@/components/property-card";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, OFFERS, offersInCategory } from "@/lib/offers";
import { cn } from "@/lib/utils";

type PropertiesSearch = { category?: string };

export const Route = createFileRoute("/properties")({
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
    <main className="pt-24">
      <section className="container-pg pb-8 pt-10 md:pt-14">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">
          Marketplace
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
          Property opportunities
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          Only published offers are listed. Coming-soon categories are marked
          clearly — we do not invent inventory.
        </p>
      </section>

      <section className="container-pg flex flex-wrap gap-2 pb-10">
        <FilterChip to="/properties" active={!category}>
          All available
        </FilterChip>
        {CATEGORIES.map((c) => (
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
      </section>

      <section className="container-pg pb-20">
        {list.length > 0 ? (
          <div
            className={cn(
              "grid gap-6",
              list.length === 1 ? "max-w-xl" : "sm:grid-cols-2",
            )}
          >
            {list.map((offer) => (
              <PropertyCard key={offer.slug} offer={offer} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-cream px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <Badge>{active?.available ? "No offers" : "Coming soon"}</Badge>
            <p className="mt-4 font-display text-2xl font-semibold">
              {active?.title ?? "This category"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              {active?.blurb ??
                "No published offers in this category yet."}
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
    </main>
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
      <span className="inline-flex h-10 items-center rounded-full bg-mist px-4 text-sm text-subtle">
        {children}
      </span>
    );
  }
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-pine text-pine-fg"
          : "bg-cream text-ink shadow-[0_0_0_1px_rgb(26_25_22/0.08)] hover:bg-mist",
      )}
    >
      {children}
    </Link>
  );
}
