import { createFileRoute } from "@tanstack/react-router";
import { List } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { formatWhen, usePlatform, type TxType } from "@/lib/platform";

export const Route = createFileRoute("/app/transactions")({
  component: TransactionsPage,
});

const TYPES: Array<TxType | "all"> = ["all", "booking", "commission", "activation"];

function TransactionsPage() {
  const { member } = useMemberSession();
  const transactions = usePlatform((s) => s.transactions);
  const [q, setQ] = useState("");
  const [type, setType] = useState<TxType | "all">("all");
  const rows = useMemo(() => {
    if (!member) return [];
    return transactions
      .filter((t) => t.userId === member.userId)
      .filter((t) => type === "all" || t.type === type)
      .filter((t) => {
        const hay = `${t.reference} ${t.type} ${t.status}`.toLowerCase();
        return hay.includes(q.trim().toLowerCase());
      });
  }, [transactions, member, q, type]);

  if (!member) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Activity"
        title="Transactions"
        description="Booking requests, commission lines, and activation requests. Reversed items stay visible."
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search reference or status"
          aria-label="Search transactions"
        />
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={
                type === t
                  ? "h-11 rounded-full bg-pine px-4 text-sm font-medium text-pine-fg"
                  : "h-11 rounded-full bg-cream px-4 text-sm font-medium text-ink shadow-[0_0_0_1px_rgb(26_25_22/0.08)]"
              }
            >
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={List}
          title="No transactions"
          description="Activity appears when you submit a booking or activation request, or when commission is posted."
        />
      ) : (
        <Surface className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{t.type}</p>
                  <p className="truncate text-xs text-muted">{t.reference}</p>
                  <p className="text-xs text-subtle">{formatWhen(t.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatBdt(t.amount)}</p>
                  <StatusBadge status={t.status} />
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
