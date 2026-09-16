import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { formatBdt, fromApiOffer, isPublished } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/offers/")({ component: AdminOffers });

function AdminOffers() {
  const { data, reload, loading } = useAsync(() => api.admin.offers(), []);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offers = (data?.offers ?? []).map(fromApiOffer);

  async function setStatus(slug: string, status: "published" | "draft" | "closed") {
    setPending(`${slug}:${status}`);
    setError(null);
    try {
      await api.admin.setOfferStatus(slug, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update offer status.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Catalog"
        title="Properties / Offers"
        description="Create and manage property offers. Economics stay offer-specific. Existing bookings keep their original snapshot. Inventory is shared across General Marketplace and Growth Program."
        action={
          <Button asChild size="sm">
            <Link to="/admin/offers/new">Add offer</Link>
          </Button>
        }
      />
      {error ? <p className="text-sm text-clay" role="alert">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted">Loading offers…</p>
      ) : offers.length === 0 ? (
        <EmptyState icon={Building2} title="No offers yet" description="Add a draft offer, then publish it when the terms and images are ready." />
      ) : (
        <Surface className="overflow-x-auto p-0 sm:p-0">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Booking</th>
                <th className="px-4 py-3 font-medium">Retail</th>
                <th className="px-4 py-3 font-medium">Available</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {offers.map((o) => (
                <tr key={o.slug} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.title}</p>
                    {o.flagship ? <p className="text-xs text-pine">Flagship</p> : null}
                  </td>
                  <td className="px-4 py-3 text-muted">{o.category}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status === "available" ? "published" : o.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatBdt(o.bookingAmount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatBdt(o.retailValue)}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted">
                    {o.inventory?.total == null ? "Unbounded" : `${o.inventory.available ?? 0} / ${o.inventory.total}`}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatWhen(o.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/admin/offers/$slug" params={{ slug: o.slug }}>
                          Edit
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/admin/offers/$slug/preview" params={{ slug: o.slug }}>
                          Preview
                        </Link>
                      </Button>
                      {isPublished(o.status) ? (
                        <>
                          <Button size="sm" variant="secondary" disabled={pending === `${o.slug}:draft`} onClick={() => void setStatus(o.slug, "draft")}>
                            Unpublish
                          </Button>
                          <Button size="sm" variant="secondary" disabled={pending === `${o.slug}:closed`} onClick={() => void setStatus(o.slug, "closed")}>
                            Close
                          </Button>
                        </>
                      ) : o.status === "closed" ? (
                        <Button size="sm" variant="secondary" disabled={pending === `${o.slug}:published`} onClick={() => void setStatus(o.slug, "published")}>
                          Reopen
                        </Button>
                      ) : (
                        <Button size="sm" disabled={pending === `${o.slug}:published`} onClick={() => void setStatus(o.slug, "published")}>
                          Publish
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}
    </div>
  );
}
