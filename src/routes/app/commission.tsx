import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { EmptyState, PageHeader, StatCard, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/commission")({
  component: CommissionPage,
});

function CommissionPage() {
  const { member } = useMemberSession();
  const { data } = useAsync(() => api.myCommissions(), [member?.user_id], { enabled: Boolean(member) });
  if (!member) return null;

  const wallet = data?.totals ?? { available: 0, pending: 0, paid: 0, reversed: 0, rejected: 0 };
  const rows = data?.commissions ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Commission"
        title="Commission wallet"
        description="Rates: L1 10% · L2 8% · L3 6% · L4 4% · L5 2%. Each line uses that source booking’s actual confirmed amount — never a universal booking figure."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available" value={formatBdt(wallet.available)} />
        <StatCard label="Pending" value={formatBdt(wallet.pending)} />
        <StatCard label="Paid" value={formatBdt(wallet.paid)} />
        <StatCard label="Reversed" value={formatBdt(wallet.reversed)} hint="History is kept." />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No commissions yet"
          description="Commission appears when a confirmed booking in your network generates a line at your level. There is no guaranteed earnings total."
        />
      ) : (
        <Surface className="p-0 sm:p-0">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-subtle">
                <tr className="border-b border-line">
                  {["Date", "Source", "Level", "Rate", "Booking amount", "Commission", "Status"].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">{formatWhen(c.created_at)}</td>
                    <td className="px-5 py-3">{c.source_offer_title ?? "—"}</td>
                    <td className="px-5 py-3">L{c.level}</td>
                    <td className="px-5 py-3 tabular-nums">{Math.round(c.rate * 100)}%</td>
                    <td className="px-5 py-3 tabular-nums">{formatBdt(c.source_booking_amount)}</td>
                    <td className="px-5 py-3 tabular-nums font-medium">{formatBdt(c.amount)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((c) => (
              <li key={c.id} className="space-y-2 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{c.source_offer_title ?? "—"}</p>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-sm text-muted">
                  L{c.level} · {Math.round(c.rate * 100)}% of {formatBdt(c.source_booking_amount)}
                </p>
                <p className="text-sm font-semibold tabular-nums">{formatBdt(c.amount)}</p>
                <p className="text-xs text-subtle">{formatWhen(c.created_at)}</p>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
