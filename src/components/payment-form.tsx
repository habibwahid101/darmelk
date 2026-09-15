import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { api, ApiError, type PaymentDestination } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatBdt } from "@/lib/offers";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/states";

type ManualTarget = "activation" | "booking" | "merchant_bundle";
type PayMode = PaymentDestination["method"] | "merchant";

function destinationLabel(destination: PaymentDestination, targetType: ManualTarget) {
  if (targetType === "booking" && destination.method === "bank") return "Pay via Darmelk Bank";
  return destination.label;
}

export function PaymentForm({
  targetType,
  targetId,
  amount,
  onSubmitted,
}: {
  targetType: ManualTarget;
  targetId: string;
  amount: number;
  onSubmitted: () => void;
}) {
  const { data } = useAsync(() => api.paymentDestinations(targetType), [targetType]);
  const destinations = data?.destinations ?? [];
  const allowMerchant = targetType === "booking";
  const [method, setMethod] = useState<PayMode>(allowMerchant ? "bank" : "bkash");
  const [referenceId, setReferenceId] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [merchantUserId, setMerchantUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const selected = destinations.find((d) => d.method === method);
  const merchantMode = allowMerchant && method === "merchant";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (merchantMode) {
        if (!merchantUserId.trim()) {
          setError("Enter the Merchant User ID.");
          setPending(false);
          return;
        }
        await api.requestMerchantPay(targetId, merchantUserId.trim(), crypto.randomUUID());
        onSubmitted();
        return;
      }
      if (!proof) {
        setError("Upload payment proof.");
        setPending(false);
        return;
      }
      if (proof.size > 4 * 1024 * 1024) {
        setError("Payment proof must be 4 MB or smaller.");
        setPending(false);
        return;
      }
      const proofBase64 = await fileBase64(proof);
      await api.submitPayment(
        {
          targetType,
          targetId,
          paymentMethod: method as PaymentDestination["method"],
          referenceId,
          proofFilename: proof.name,
          proofMime: proof.type,
          proofBase64,
          notes: notes.trim() || undefined,
        },
        crypto.randomUUID(),
      );
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit payment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">Exact amount due</p>
          <p className="font-display text-3xl font-semibold break-words">{formatBdt(amount)}</p>
        </div>
        <p className="max-w-sm text-sm text-muted">
          {merchantMode
            ? "Request payment from an active Merchant. The booking stays pending until Darmelk confirms it."
            : allowMerchant
              ? "Pay via Darmelk Bank, then submit the reference and proof. Payment is not approved automatically."
              : "Pay manually, then submit the reference and proof. Payment is not approved automatically."}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Payment method"
        className={`mt-5 grid gap-2 ${allowMerchant ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
      >
        {destinations.map((d) => {
          const selectedMethod = method === d.method;
          return (
            <button
              key={d.method}
              type="button"
              role="radio"
              aria-checked={selectedMethod}
              onClick={() => setMethod(d.method)}
              className={
                selectedMethod
                  ? "min-h-11 rounded-xl bg-pine px-4 py-3 text-left text-sm font-medium text-pine-fg"
                  : "min-h-11 rounded-xl bg-mist px-4 py-3 text-left text-sm font-medium"
              }
            >
              {destinationLabel(d, targetType)}
            </button>
          );
        })}
        {allowMerchant ? (
          <button
            type="button"
            role="radio"
            aria-checked={merchantMode}
            onClick={() => setMethod("merchant")}
            className={
              merchantMode
                ? "min-h-11 rounded-xl bg-pine px-4 py-3 text-left text-sm font-medium text-pine-fg"
                : "min-h-11 rounded-xl bg-mist px-4 py-3 text-left text-sm font-medium"
            }
          >
            Pay by Merchant
          </button>
        ) : null}
      </div>
      {merchantMode ? (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Merchant User ID" hint="The canonical Darmelk User ID of an active Merchant. No password or OTP is required." htmlFor="merchant-user-id">
            <Input
              id="merchant-user-id"
              value={merchantUserId}
              onChange={(e) => setMerchantUserId(e.target.value)}
              maxLength={120}
              required
              autoComplete="off"
            />
          </Field>
          <p className="text-sm text-muted">
            This creates a payment request for {formatBdt(amount)}. Merchant Credit is reserved only if the Merchant
            approves. Commission is not created at this step.
          </p>
          {error ? <p className="text-sm text-clay" role="alert">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending request…" : "Send Merchant payment request"}
          </Button>
        </form>
      ) : (
        <>
          {selected ? (
            <div className="mt-4 rounded-xl bg-paper p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{destinationLabel(selected, targetType)}</p>
                  {selected.bankName ? (
                    <p className="text-muted">
                      {selected.bankName} · {selected.branch}
                    </p>
                  ) : (
                    <p className="text-muted">{selected.accountType}</p>
                  )}
                  {selected.accountName ? <p className="text-muted">Account name: {selected.accountName}</p> : null}
                  <p className="mt-1 break-all font-semibold tabular-nums">{selected.account}</p>
                </div>
                <button
                  type="button"
                  aria-label="Copy payment account"
                  className="grid size-11 shrink-0 place-items-center rounded-lg bg-cream"
                  onClick={async () => {
                    await navigator.clipboard.writeText(selected.account);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }}
                >
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                </button>
              </div>
              <p className="mt-3 text-muted">
                Send exactly {formatBdt(amount)} and keep the transaction reference. Routing number is not required for
                this bank destination.
              </p>
            </div>
          ) : null}
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Transaction / reference ID" htmlFor="payment-reference">
              <Input
                id="payment-reference"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                maxLength={120}
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Payment proof" hint="JPG, PNG, WebP, or PDF · maximum 4 MB" htmlFor="payment-proof">
              <Input
                id="payment-proof"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                required
              />
            </Field>
            <Field label="Notes" hint="Optional" htmlFor="payment-notes">
              <textarea
                id="payment-notes"
                className="min-h-24 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-pine"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
              />
            </Field>
            {error ? <p className="text-sm text-clay" role="alert">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending || !selected}>
              {pending ? "Submitting…" : "Submit for review"}
            </Button>
          </form>
        </>
      )}
    </Surface>
  );
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read proof"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}
