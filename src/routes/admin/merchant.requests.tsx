import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/merchant/requests")({
  component: AdminMerchantRequests,
});

function AdminMerchantRequests() {
  const { data, loading } = useAsync(() => api.admin.merchantRequests(), []);
  const rows = data?.requests ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant Management"
        title="Payment requests"
        description="Merchant approval reserves credit. Booking confirmation settles it. This screen does not bypass ledger safeguards."
      />
      {loading && !data ? (
        <p className="text-sm text-muted">Loading requests…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="No Merchant payment requests" description="Pay by Merchant requests will appear here for audit." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{row.offer_title}</p>
                  <p className="mt-1 break-all text-sm text-muted">
                    {row.purpose === "growth_activation" ? "Growth Program Activation" : `Booking ${row.booking_id}`}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Customer {row.customer_name ?? row.customer_user_id} · Merchant {row.merchant_name ?? row.merchant_user_id}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 font-display text-xl font-semibold tabular-nums">{formatBdt(row.amount)}</p>
              <p className="mt-1 text-xs text-muted">{formatWhen(row.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}