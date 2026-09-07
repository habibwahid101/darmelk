import { createFileRoute } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/merchant/gifts")({
  component: AdminMerchantGifts,
});

function AdminMerchantGifts() {
  const { data, reload, loading } = useAsync(() => api.admin.merchantGifts(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = data?.gifts ?? [];

  async function setStatus(id: string, status: "pending" | "fulfilled" | "cancelled") {
    setBusy(`${id}:${status}`);
    setError(null);
    try {
      await api.admin.setMerchantGiftStatus(id, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update gift status.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant Management"
        title="Gift fulfillment"
        description="Physical or non-credit gifts promised with a confirmed bundle. Gift value is not Merchant Credit."
      />
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted">Loading gifts…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Gift} title="No gift records" description="Gifts appear after a confirmed bundle purchase that included a reward." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {row.quantity} × {row.gift_label}
                  </p>
                  <p className="text-sm text-muted">{row.merchant_name} · {row.bundle_name}</p>
                  <p className="text-xs text-muted">{formatWhen(row.created_at)}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === `${row.id}:fulfilled`} onClick={() => void setStatus(row.id, "fulfilled")}>
                  Mark fulfilled
                </Button>
                <Button size="sm" variant="secondary" disabled={busy === `${row.id}:cancelled`} onClick={() => void setStatus(row.id, "cancelled")}>
                  Cancel
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}