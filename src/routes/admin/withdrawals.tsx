import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Wallet } from "lucide-react";
import { EmptyState, LoadingState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, type Withdrawal } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";

export const Route = createFileRoute("/admin/withdrawals")({ component: AdminWithdrawals });

function AdminWithdrawals() {
  const { data, reload, loading } = useAsync(() => api.admin.withdrawals(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = data?.withdrawals ?? [];

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Finance"
        title="Withdrawals"
        description="Review eligibility and immutable payout snapshots before manual payment."
      />
      {loading && !data ? (
        <LoadingState label="Loading withdrawals…" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No withdrawal requests" description="Eligible member requests appear here." />
      ) : (
        <Surface className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {rows.map((w) => (
              <WithdrawalCard key={w.id} w={w} busy={busy === w.id} run={run} />
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}

function WithdrawalCard({
  w,
  busy,
  run,
}: {
  w: Withdrawal;
  busy: boolean;
  run: (id: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [reference, setReference] = useState(w.admin_payment_reference ?? "");
  const canPay = Boolean(reference.trim());

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-medium">{w.user_name ?? w.user_id}</p>
          <p className="text-sm text-muted">
            Requested {formatBdt(w.amount)} · fee {formatBdt(w.fee_amount)} · net {formatBdt(w.net_amount)}
          </p>
          <p className="text-xs text-subtle">
            {w.payout_method_snapshot?.methodType?.toUpperCase()} · {w.payout_method_snapshot?.details?.accountNumber} ·{" "}
            {formatWhen(w.requested_at)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Eligibility: ID {w.member_active ? "active" : "inactive"} · own booking{" "}
            {w.own_booking_eligible ? "confirmed" : "missing"}
          </p>
        </div>
        <StatusBadge status={w.status} className="self-start" />
      </div>
      <div className="flex flex-col gap-3">
        {w.status === "requested" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="shrink-0" disabled={busy} onClick={() => void run(w.id, () => api.admin.decideWithdrawal(w.id, "approve"))}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              disabled={busy}
              onClick={() => void run(w.id, () => api.admin.decideWithdrawal(w.id, "reject"))}
            >
              Reject
            </Button>
          </div>
        ) : null}
        {w.status === "approved" ? (
          <div className="grid gap-3 sm:max-w-sm">
            <Field label="Transaction / Reference ID" htmlFor={`wd-ref-${w.id}`}>
              <Input
                id={`wd-ref-${w.id}`}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Transaction / Reference ID"
                autoComplete="off"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="shrink-0"
                disabled={busy || !canPay}
                onClick={() => void run(w.id, () => api.admin.decideWithdrawal(w.id, "mark-paid", reference.trim()))}
              >
                Mark as Paid
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                disabled={busy}
                onClick={() => void run(w.id, () => api.admin.decideWithdrawal(w.id, "reject"))}
              >
                Reject
              </Button>
            </div>
          </div>
        ) : null}
        {w.admin_payment_reference ? <p className="text-sm text-muted">Payment ref {w.admin_payment_reference}</p> : null}
        {w.status === "paid" && w.paid_at ? (
          <p className="text-xs text-subtle">
            Paid {formatWhen(w.paid_at)} · {formatBdt(w.amount)} · fee {formatBdt(w.fee_amount)} · net {formatBdt(w.net_amount)}
          </p>
        ) : null}
      </div>
    </li>
  );
}
