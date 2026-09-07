import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AmountRow, PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/merchant/accounts/$userId")({
  component: AdminMerchantAccount,
});

function AdminMerchantAccount() {
  const { userId } = Route.useParams();
  const { data, reload, loading } = useAsync(() => api.admin.merchant(userId), [userId]);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const merchant = data?.merchant;

  async function setStatus(status: "active" | "suspended" | "inactive") {
    setStatusBusy(status);
    setError(null);
    try {
      await api.admin.setMerchantStatus(userId, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.");
    } finally {
      setStatusBusy(null);
    }
  }

  async function adjust() {
    setPending(true);
    setError(null);
    try {
      await api.admin.adjustMerchantCredit(userId, { amount: Number(amount), direction, reason });
      setAmount("");
      setReason("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record adjustment.");
    } finally {
      setPending(false);
    }
  }

  if (loading && !merchant) return <p className="text-sm text-muted">Loading Merchant account…</p>;
  if (!merchant) return <p className="text-sm text-clay">Merchant not found.</p>;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant Management"
        title={merchant.name ?? "Merchant"}
        description={merchant.email ?? userId}
        action={<StatusBadge status={merchant.status} />}
      />
      <p className="break-all text-sm text-muted">Merchant User ID {merchant.user_id}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available" value={formatBdt(merchant.available)} />
        <StatCard label="Purchased issued" value={formatBdt(merchant.purchased_issued)} />
        <StatCard label="Bonus issued" value={formatBdt(merchant.bonus_issued)} />
        <StatCard label="Reserved / settled" value={formatBdt(merchant.reserved + merchant.settled)} hint={`${formatBdt(merchant.reserved)} reserved`} />
      </div>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={statusBusy === "active"} onClick={() => void setStatus("active")}>
          Activate
        </Button>
        <Button size="sm" variant="secondary" disabled={statusBusy === "suspended"} onClick={() => void setStatus("suspended")}>
          Suspend
        </Button>
        <Button size="sm" variant="secondary" disabled={statusBusy === "inactive"} onClick={() => void setStatus("inactive")}>
          Deactivate
        </Button>
      </div>
      <Surface>
        <h2 className="font-display text-xl font-semibold">Audited adjustment</h2>
        <p className="mt-2 text-sm text-muted">Requires amount, direction, and reason. Raw balance overwrite is not available.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Amount">
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Direction">
            <select className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm" value={direction} onChange={(e) => setDirection(e.target.value as "credit" | "debit")}>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        </div>
        <Button className="mt-4" size="sm" disabled={pending || !amount || !reason.trim()} onClick={() => void adjust()}>
          {pending ? "Recording…" : "Record adjustment"}
        </Button>
      </Surface>
      <Surface>
        <h2 className="font-display text-xl font-semibold">Purchases</h2>
        <ul className="mt-4 space-y-3">
          {(data?.purchases ?? []).map((purchase) => (
            <li key={purchase.id} className="rounded-xl bg-paper p-4">
              <div className="flex justify-between gap-3">
                <p className="font-medium">{purchase.bundle_name}</p>
                <StatusBadge status={purchase.status} />
              </div>
              <dl className="mt-2">
                <AmountRow label="Paid" value={purchase.purchase_amount} compact />
                <AmountRow label="Purchased" value={purchase.purchased_credit} compact />
                <AmountRow label="Bonus" value={purchase.bonus_credit} compact />
              </dl>
            </li>
          ))}
        </ul>
      </Surface>
      <Surface>
        <h2 className="font-display text-xl font-semibold">Ledger</h2>
        <ul className="mt-4 divide-y divide-line">
          {(data?.ledger ?? []).map((entry) => (
            <li key={entry.id} className="py-3">
              <div className="flex justify-between gap-3">
                <p className="text-sm font-medium">{entry.entry_type.replaceAll("_", " ")}</p>
                <p className="tabular-nums text-sm">{formatBdt(entry.amount)}</p>
              </div>
              <p className="text-xs text-muted">{formatWhen(entry.created_at)}{entry.reason ? ` · ${entry.reason}` : ""}</p>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}