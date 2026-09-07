import { createFileRoute, Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/merchant/bundles/")({
  component: AdminMerchantBundles,
});

function AdminMerchantBundles() {
  const { data, reload, loading } = useAsync(() => api.admin.merchantBundles(), []);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bundles = data?.bundles ?? [];

  async function setStatus(id: string, status: "active" | "inactive" | "draft") {
    setPending(`${id}:${status}`);
    setError(null);
    try {
      await api.admin.setMerchantBundleStatus(id, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update bundle status.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant Management"
        title="Merchant bundles"
        description="Editing a bundle changes future purchases only. Historical purchases keep their economic snapshot."
        action={
          <Button asChild size="sm">
            <Link to="/admin/merchant/bundles/new">Add bundle</Link>
          </Button>
        }
      />
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted">Loading bundles…</p>
      ) : bundles.length === 0 ? (
        <EmptyState icon={Store} title="No bundles yet" description="Create a draft bundle, then activate it when terms and amounts are ready." />
      ) : (
        <ul className="grid gap-3">
          {bundles.map((bundle) => (
            <li key={bundle.id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{bundle.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    Pay {formatBdt(bundle.purchase_amount)} · {formatBdt(bundle.purchased_credit)} purchased +{" "}
                    {formatBdt(bundle.bonus_credit)} bonus
                  </p>
                  {bundle.gifts.length ? (
                    <p className="mt-1 text-sm text-muted">{bundle.gifts.map((g) => `${g.quantity} × ${g.label}`).join(", ")}</p>
                  ) : null}
                </div>
                <StatusBadge status={bundle.status} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/admin/merchant/bundles/$id" params={{ id: bundle.id }}>
                    Edit
                  </Link>
                </Button>
                {bundle.status === "active" ? (
                  <Button size="sm" variant="secondary" disabled={pending === `${bundle.id}:inactive`} onClick={() => void setStatus(bundle.id, "inactive")}>
                    Deactivate
                  </Button>
                ) : (
                  <Button size="sm" disabled={pending === `${bundle.id}:active`} onClick={() => void setStatus(bundle.id, "active")}>
                    Activate
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
