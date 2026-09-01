import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { EmptyState, PageHeader, StatCard, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/app/commission")({
  component: CommissionPage,
});

function CommissionPage() {
  const { member } = useMemberSession();
  const { data } = useAsync(() => api.myCommissions(), [member?.user_id], { enabled: Boolean(member) });
  const { data: payoutData } = useAsync(() => api.payoutMethods(), [member?.user_id], { enabled: Boolean(member) });
  const { data: withdrawalData, reload: reloadWithdrawals } = useAsync(() => api.myWithdrawals(), [member?.user_id], { enabled: Boolean(member) });
  const [amount,setAmount]=useState(1000); const [methodId,setMethodId]=useState(""); const [pending,setPending]=useState(false); const [error,setError]=useState<string|null>(null);
  if (!member) return null;

  const wallet = data?.totals ?? { available: 0, pending: 0, paid: 0, reversed: 0, rejected: 0 };
  const rows = data?.commissions ?? [];
  const fee = Math.round((Number.isFinite(amount)?amount:0)*0.025);
  async function withdraw(e:React.FormEvent){e.preventDefault();setPending(true);setError(null);try{await api.requestWithdrawal(amount,methodId,crypto.randomUUID());reloadWithdrawals();}catch(err){setError(err instanceof ApiError?err.message:"Could not request withdrawal.");}finally{setPending(false)}}

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

      <Surface>
        <h2 className="font-display text-xl font-semibold">Withdraw earnings</h2>
        <p className="mt-2 text-sm text-muted">Requires current annual activation, an own confirmed booking, minimum BDT 1,000, and a saved payout method.</p>
        <form onSubmit={withdraw} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Saved payout method"><select className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm" value={methodId} onChange={(e)=>setMethodId(e.target.value)} required><option value="">Select method</option>{(payoutData?.methods??[]).map((m)=><option key={m.id} value={m.id}>{m.method_type.toUpperCase()} · {m.details.accountNumber}</option>)}</select></Field>
          <Field label="Requested amount"><Input type="number" min={1000} step={1} value={amount} onChange={(e)=>setAmount(Number(e.target.value))} required/></Field>
          <dl className="rounded-xl bg-mist p-4 text-sm sm:col-span-2"><Row label="Requested" value={formatBdt(amount||0)}/><Row label="Fee (2.5%)" value={formatBdt(fee)}/><Row label="Net payable" value={formatBdt(Math.max(0,(amount||0)-fee))}/></dl>
          {error?<p className="text-sm text-clay sm:col-span-2">{error}</p>:null}<Button type="submit" disabled={pending || member.activation_status!=="active" || !methodId}>{pending?"Submitting…":"Confirm withdrawal request"}</Button>
        </form>
        {(withdrawalData?.withdrawals??[]).length?<ul className="mt-6 divide-y divide-line border-t border-line">{withdrawalData!.withdrawals.map((w)=><li key={w.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{formatBdt(w.amount)} · net {formatBdt(w.net_amount)}</span><StatusBadge status={w.status}/></li>)}</ul>:null}
      </Surface>

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

function Row({label,value}:{label:string;value:string}){return <div className="flex justify-between gap-4 py-1"><dt className="text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>}
