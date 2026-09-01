import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { api, ApiError, type PaymentDestination } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatBdt } from "@/lib/offers";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/states";

export function PaymentForm({ targetType, targetId, amount, onSubmitted }: { targetType: "activation" | "booking"; targetId: string; amount: number; onSubmitted: () => void }) {
  const { data } = useAsync(() => api.paymentDestinations(), []);
  const destinations = data?.destinations ?? [];
  const [method, setMethod] = useState<PaymentDestination["method"]>("bkash");
  const [referenceId, setReferenceId] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const selected = destinations.find((d) => d.method === method);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!proof) return setError("Upload payment proof.");
    if (proof.size > 4 * 1024 * 1024) return setError("Payment proof must be 4 MB or smaller.");
    setPending(true); setError(null);
    try {
      const proofBase64 = await fileBase64(proof);
      await api.submitPayment({ targetType, targetId, paymentMethod: method, referenceId, proofFilename: proof.name, proofMime: proof.type, proofBase64, notes: notes.trim() || undefined }, crypto.randomUUID());
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit payment.");
    } finally { setPending(false); }
  }

  return <Surface>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm text-muted">Exact amount due</p><p className="font-display text-3xl font-semibold">{formatBdt(amount)}</p></div>
      <p className="max-w-sm text-sm text-muted">Pay manually, then submit the reference and proof. Payment is not approved automatically.</p>
    </div>
    <div className="mt-5 grid gap-2 sm:grid-cols-3">
      {destinations.map((d) => <button key={d.method} type="button" onClick={() => setMethod(d.method)} className={method === d.method ? "rounded-xl bg-pine px-4 py-3 text-left text-sm font-medium text-pine-fg" : "rounded-xl bg-mist px-4 py-3 text-left text-sm font-medium"}>{d.label}</button>)}
    </div>
    {selected ? <div className="mt-4 rounded-xl bg-paper p-4 text-sm">
      <div className="flex items-start justify-between gap-3"><div>
        <p className="font-medium">{selected.label}</p>
        {selected.bankName ? <p className="text-muted">{selected.bankName} · {selected.branch}</p> : <p className="text-muted">{selected.accountType}</p>}
        {selected.accountName ? <p className="text-muted">Account name: {selected.accountName}</p> : null}
        <p className="mt-1 font-semibold tabular-nums">{selected.account}</p>
      </div><button type="button" aria-label="Copy payment account" className="grid size-10 place-items-center rounded-lg bg-cream" onClick={async()=>{await navigator.clipboard.writeText(selected.account);setCopied(true);setTimeout(()=>setCopied(false),1200);}}>{copied?<Check className="size-4"/>:<Copy className="size-4"/>}</button></div>
      <p className="mt-3 text-muted">Send exactly {formatBdt(amount)} and keep the transaction reference. Routing number is not required for this bank destination.</p>
    </div> : null}
    <form onSubmit={submit} className="mt-5 space-y-4">
      <Field label="Transaction / reference ID"><Input value={referenceId} onChange={(e)=>setReferenceId(e.target.value)} maxLength={120} required /></Field>
      <Field label="Payment proof" hint="JPG, PNG, WebP, or PDF · maximum 4 MB"><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e)=>setProof(e.target.files?.[0] ?? null)} required /></Field>
      <Field label="Notes" hint="Optional"><textarea className="min-h-24 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-pine" value={notes} onChange={(e)=>setNotes(e.target.value)} maxLength={1000}/></Field>
      {error?<p className="text-sm text-clay">{error}</p>:null}
      <Button type="submit" className="w-full" disabled={pending || !selected}>{pending?"Submitting…":"Submit for review"}</Button>
    </form>
  </Surface>;
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror=()=>reject(new Error("Could not read proof")); reader.onload=()=>resolve(String(reader.result).split(",")[1] ?? ""); reader.readAsDataURL(file); });
}
