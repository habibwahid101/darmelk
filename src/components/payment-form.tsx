import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { api, ApiError, type PaymentOptions } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatBdt } from "@/lib/offers";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/states";
import { TermsAccept } from "@/components/terms-accept";

type ManualTarget = "activation" | "booking" | "merchant_bundle";
type Rail = "bank" | "mfs" | "merchant";

function providerLabel(provider: string) {
  if (provider === "bkash") return "bKash";
  if (provider === "nagad") return "Nagad";
  if (provider === "bank") return "Darmelk Bank";
  return provider;
}

function railLabel(rail: Rail, targetType: ManualTarget) {
  if (rail === "bank") return targetType === "booking" ? "Pay via Darmelk Bank" : "Darmelk Bank";
  if (rail === "mfs") return "Pay by MFS";
  return "Pay by Merchant";
}

export function describePaymentOptions(options?: PaymentOptions | null, targetType?: ManualTarget) {
  const available = options?.methods.filter((method) => method.available) ?? [];
  const parts = available.map((method) => {
    if (method.method === "bank") return targetType === "booking" ? "Pay via Darmelk Bank" : "Darmelk Bank";
    if (method.method === "mfs") {
      const providers = [...new Set(method.accounts.map((account) => providerLabel(account.provider)))];
      return providers.length ? providers.join(", ") : "MFS";
    }
    return "Pay by Merchant";
  });
  if (!parts.length) return "No payment methods are currently available for this transaction.";
  if (parts.length === 1) return `${parts[0]}. Darmelk confirms after review.`;
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}. Darmelk confirms after review.`;
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
  const { data } = useAsync(() => api.paymentOptions(targetType), [targetType]);
  const options = data?.options;
  const methods = options?.methods ?? [];
  const available = methods.filter((method) => method.available);
  const allowMerchant = Boolean(methods.find((method) => method.method === "merchant")?.available);
  const [rail, setRail] = useState<Rail | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [referenceId, setReferenceId] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [merchantUserId, setMerchantUserId] = useState("");
  const [merchantTerms, setMerchantTerms] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!available.length) {
      setRail(null);
      setAccountId("");
      return;
    }
    const preferred =
      (targetType === "booking" && available.find((method) => method.method === "bank")) ||
      (targetType === "activation" && available.find((method) => method.method === "mfs")) ||
      available[0];
    if (!preferred) return;
    setRail((current) => current && available.some((method) => method.method === current) ? current : preferred.method);
  }, [available.map((method) => method.method).join("|"), targetType]);

  const selectedRail = methods.find((method) => method.method === rail);
  const accounts = selectedRail?.accounts ?? [];
  const selected = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? accounts[0] ?? null,
    [accounts, accountId],
  );

  useEffect(() => {
    if (!accounts.length) {
      setAccountId("");
      return;
    }
    setAccountId((current) => (accounts.some((account) => account.id === current) ? current : accounts[0]!.id));
  }, [accounts.map((account) => account.id).join("|")]);

  const merchantMode = allowMerchant && rail === "merchant";
  const merchantTermsReady = Boolean(merchantTerms.MERCHANT_PAYMENT_TERMS);

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
        if (!merchantTermsReady) {
          setError("Merchant Payment Terms must be accepted.");
          setPending(false);
          return;
        }
        if (targetType === "activation") {
          await api.requestActivationMerchantPay(targetId, merchantUserId.trim(), crypto.randomUUID(), true);
        } else {
          await api.requestMerchantPay(targetId, merchantUserId.trim(), crypto.randomUUID(), true);
        }
        onSubmitted();
        return;
      }
      if (!selected) {
        setError("Select a receiving account.");
        setPending(false);
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
          paymentMethod: selected.method === "bank" ? "bank" : selected.provider,
          receivingAccountId: selected.id,
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
            ? targetType === "activation"
              ? "Request payment from an active Merchant. Growth Program Activation stays pending until Darmelk confirms it."
              : "Request payment from an active Merchant. The booking stays pending until Darmelk confirms it."
            : allowMerchant
              ? "Pay via Darmelk Bank, then submit the reference and proof. Payment is not approved automatically."
              : "Pay manually, then submit the reference and proof. Payment is not approved automatically."}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Payment method"
        className={`mt-5 grid gap-2 ${available.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
      >
        {available.map((method) => {
          const selectedMethod = rail === method.method;
          return (
            <button
              key={method.method}
              type="button"
              role="radio"
              aria-checked={selectedMethod}
              onClick={() => {
                setRail(method.method);
                setMerchantTerms({});
              }}
              className={
                selectedMethod
                  ? "min-h-11 rounded-xl bg-pine px-4 py-3 text-left text-sm font-medium text-pine-fg"
                  : "min-h-11 rounded-xl bg-mist px-4 py-3 text-left text-sm font-medium"
              }
            >
              {railLabel(method.method, targetType)}
            </button>
          );
        })}
      </div>
      {!available.length ? (
        <p className="mt-5 text-sm text-muted">This payment method is currently unavailable for this transaction.</p>
      ) : null}
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
            approves. Merchant approval does not confirm the booking, consume inventory, create commission, or qualify
            a promotion. Merchant Credit is separate from the Commission Wallet.
          </p>
          <TermsAccept
            statement="Read the Merchant Payment Terms, then confirm. The box starts unchecked."
            items={[
              {
                key: "MERCHANT_PAYMENT_TERMS",
                label: "Merchant Payment Terms",
                href: "/terms?key=merchant-payment",
              },
            ]}
            accepted={merchantTerms}
            onChange={(key, value) => setMerchantTerms((current) => ({ ...current, [key]: value }))}
          />
          {error ? <p className="text-sm text-clay" role="alert">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending || !merchantTermsReady}>
            {pending ? "Sending request…" : "Send Merchant payment request"}
          </Button>
        </form>
      ) : (
        <>
          {accounts.length > 1 ? (
            <div role="radiogroup" aria-label="Receiving account" className="mt-4 grid gap-2">
              {accounts.map((account) => {
                const active = selected?.id === account.id;
                return (
                  <button
                    key={account.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAccountId(account.id)}
                    className={
                      active
                        ? "min-h-11 rounded-xl bg-cream px-4 py-3 text-left text-sm shadow-[0_0_0_1px_rgb(26_92_70/0.35)]"
                        : "min-h-11 rounded-xl bg-paper px-4 py-3 text-left text-sm"
                    }
                  >
                    <span className="font-medium">{account.label}</span>
                    <span className="mt-1 block text-muted">
                      {account.method === "mfs" ? providerLabel(account.provider) : account.bank_name} · {account.account_number}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {selected ? (
            <div className="mt-4 rounded-xl bg-paper p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{selected.label}</p>
                  {selected.bank_name ? (
                    <p className="text-muted">
                      {selected.bank_name}{selected.branch ? ` · ${selected.branch}` : ""}
                    </p>
                  ) : (
                    <p className="text-muted">{selected.account_type || providerLabel(selected.provider)}</p>
                  )}
                  {selected.account_holder_name ? <p className="text-muted">Account name: {selected.account_holder_name}</p> : null}
                  <p className="mt-1 break-all font-semibold tabular-nums">{selected.account_number}</p>
                </div>
                <button
                  type="button"
                  aria-label="Copy payment account"
                  className="grid size-11 shrink-0 place-items-center rounded-lg bg-cream"
                  onClick={async () => {
                    await navigator.clipboard.writeText(selected.account_number);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }}
                >
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                </button>
              </div>
              <p className="mt-3 text-muted">
                {selected.instructions || `Send exactly ${formatBdt(amount)} and keep the transaction reference.`}
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
