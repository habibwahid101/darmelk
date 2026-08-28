import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { CATEGORIES, formatBdt, OFFERS } from "@/lib/offers";

export const Route = createFileRoute("/admin/offers")({ component: AdminOffers });

function AdminOffers() {
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Catalog"
        title="Offers & categories"
        description="Published inventory only. Coming-soon categories are listed without fake properties. Economics stay offer-specific."
      />

      <Surface className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {OFFERS.map((o) => (
            <li key={o.slug} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-medium">{o.title}</p>
                <p className="text-sm text-muted">
                  {o.category} · Retail {formatBdt(o.retailValue)} · Booking {formatBdt(o.bookingAmount)} · Benefit{" "}
                  {formatBdt(o.qualificationBenefit)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={o.status === "available" ? "available" : "pending"} />
                <Link to="/properties/$slug" params={{ slug: o.slug }} className="text-sm text-pine hover:underline">
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </Surface>

      <div>
        <h2 className="font-display text-xl font-semibold">Categories</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <li key={c.slug} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{c.title}</p>
                <StatusBadge status={c.available ? "available" : "pending"} />
              </div>
              <p className="mt-2 text-sm text-muted">{c.blurb}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
