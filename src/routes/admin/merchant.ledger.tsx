import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/merchant/ledger")({
  component: AdminMerchantLedger,
});

function AdminMerchantLedger() {
  const [userId, setUserId] = useState("");
  const [entryType, setEntryType] = useState("");
  const [applied, setApplied] = useState({ userId: "", entryType: "" });
  const { data, loading } = useAsync(
    () => api.admin.merchantLedger({ userId: applied.userId || undefined, entryType: applied.entryType || undefined }),
    [applied.userId, applied.entryType],
  );
  const rows = data?.entries ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant Management"
        title="Merchant ledger"
        description="Append-only credit history. Corrections are new entries, never silent edits."
      />
      <Surface>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem_auto]">
          <Field label="Merchant User ID">
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </Field>
          <Field label="Entry type">
            <select className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm" value={entryType} onChange={(e) => setEntryType(e.target.value)}>
              <option value="">All</option>
              <option value="purchased_credit_issued">Purchased issued</option>
              <option value="bonus_credit_issued">Bonus issued</option>
              <option value="booking_payment_reserved">Reserved</option>
              <option value="booking_payment_settled">Settled</option>
              <option value="reservation_released">Released</option>
              <option value="reversal">Reversal</option>
              <option value="admin_adjustment">Adjustment</option>
            </select>
          </Field>
          <Button className="sm:mt-6" size="sm" onClick={() => setApplied({ userId: userId.trim(), entryType })}>
            Filter
          </Button>
        </div>
      </Surface>
      {loading && !data ? (
        <p className="text-sm text-muted">Loading ledger…</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{row.entry_type.replaceAll("_", " ")}</p>
                  <p className="truncate text-sm text-muted">{row.merchant_name ?? row.merchant_user_id}</p>
                  {row.booking_id ? <p className="break-all text-xs text-subtle">Booking {row.booking_id}</p> : null}
                  {row.reason ? <p className="mt-1 text-sm text-muted">{row.reason}</p> : null}
                </div>
                <p className="tabular-nums font-medium">{formatBdt(row.amount)}</p>
              </div>
              <p className="mt-2 text-xs text-muted">{formatWhen(row.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}