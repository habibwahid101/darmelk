import { createFileRoute, Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { useMemo, useState } from "react";
import { AmountRow, EmptyState, PageHeader, StatCard, Surface } from "@/components/states";
import { PaymentForm, merchantRequestStatusLabel } from "@/components/payment-form";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { api, ApiError, type MerchantBundle, type MerchantPaymentRequest, type MerchantPurchase, type PaymentSubmission } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/merchant")({
  component: MerchantPage,
});

function latestBundlePayment(payments: PaymentSubmission[], purchaseId: string) {
  return payments
    .filter((payment) => payment.target_type === "merchant_bundle" && payment.target_id === purchaseId)
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0))[0];
}

function bundlePurchaseAction(bundleId: string, purchases: MerchantPurchase[], payments: PaymentSubmission[]) {
  const pending = purchases.find((purchase) => purchase.bundle_id === bundleId && purchase.status === "pending");
  if (pending) {
    const latest = latestBundlePayment(payments, pending.id);
    if (!latest) return { label: "Continue Payment" as const, purchase: pending, openPayment: true };
    if (latest.status === "rejected") return { label: "Retry Payment" as const, purchase: pending, openPayment: true };
    if (latest.status === "under_review") return { label: "Under Review" as const, purchase: pending, openPayment: false };
    return { label: "Payment Submitted" as const, purchase: pending, openPayment: false };
  }
  const confirmed = purchases.some((purchase) => purchase.bundle_id === bundleId && purchase.status === "confirmed");
  if (confirmed) return { label: "Buy Again" as const, purchase: null, openPayment: false };
  return { label: "Buy Bundle" as const, purchase: null, openPayment: false };
}

function MerchantPage() {
  const { member, merchant: sessionMerchant, reload: reloadSession } = useMemberSession();
  const { data, loading, reload } = useAsync(() => api.myMerchant(), [member?.user_id], {
    enabled: Boolean(member),
  });
  if (!member) return null;

  const status = data?.merchant?.status ?? sessionMerchant?.status;
  const active = status === "active";
  const showDashboard = status === "active" || status === "suspended" || status === "inactive";
  const pendingIncoming = (data?.incomingRequests ?? []).filter((r) => r.status === "pending");

  return (
    <div className="space-y-8">
      {showDashboard ? (
        <MerchantDashboard
          userId={member.user_id}
          data={data}
          loading={loading && !data}
          pendingIncoming={pendingIncoming}
          canApprove={active}
          onReload={async () => {
            await reload();
            reloadSession();
          }}
        />
      ) : (
        <BecomeAMerchant
          data={data}
          loading={loading && !data}
          onReload={async () => {
            await reload();
            reloadSession();
          }}
        />
      )}
    </div>
  );
}

function BecomeAMerchant({
  data,
  loading,
  onReload,
}: {
  data: Awaited<ReturnType<typeof api.myMerchant>> | undefined;
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<MerchantBundle | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bundles = data?.bundles ?? [];
  const purchases = data?.purchases ?? [];
  const openPurchase = purchases.find((p) => p.status === "pending");

  async function startPurchase() {
    if (!selected) return;
    if (!accepted) {
      setError("Terms & Conditions must be accepted.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { purchase } = await api.startMerchantPurchase(selected.id, true, crypto.randomUUID());
      setPurchaseId(purchase.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start this Merchant bundle purchase.");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading Merchant program…</p>;

  if (paid) {
    return (
      <div className="space-y-6">
        <PageHeader
          kicker="Merchant"
          title="Payment submitted"
          description="Credit is issued only after Darmelk verifies this bundle purchase. Refreshing this page will not issue credit twice."
        />
        <Button asChild>
          <Link to="/app">Return to overview</Link>
        </Button>
      </div>
    );
  }

  if (purchaseId || openPurchase) {
    const current = data?.purchases.find((p) => p.id === (purchaseId ?? openPurchase?.id)) ?? openPurchase;
    const amount = current?.purchase_amount ?? selected?.purchase_amount ?? 0;
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <PageHeader
          kicker="Become a Merchant"
          title={current?.bundle_name ?? selected?.name ?? "Merchant bundle"}
          description="Pay the purchase amount through an approved Darmelk destination. Merchant Credit is issued only after confirmation."
        />
        <PaymentForm
          targetType="merchant_bundle"
          targetId={purchaseId ?? openPurchase!.id}
          amount={amount}
          onSubmitted={() => {
            setPaid(true);
            void onReload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant"
        title="Become a Merchant"
        description="Merchant is an optional prepaid payment feature. It is separate from commission, withdrawal, Leadership Reward, and annual activation."
      />
      <Surface>
        <h2 className="font-display text-xl font-semibold">What Merchant is</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          A Merchant holds prepaid Merchant Credit and may approve property booking payments for Darmelk members,
          including their own bookings. Approving a request reserves credit. Commission is created only after Darmelk
          confirms and activates the booking through the existing process.
        </p>
      </Surface>
      {bundles.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No bundles available"
          description="Merchant bundles are configured by Darmelk operations. Check back when a bundle is published."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {bundles.map((bundle) => {
            const total = bundle.purchased_credit + bundle.bonus_credit;
            const isSelected = selected?.id === bundle.id;
            return (
              <button
                key={bundle.id}
                type="button"
                onClick={() => {
                  setSelected(bundle);
                  setAccepted(false);
                  setError(null);
                }}
                className={
                  isSelected
                    ? "rounded-2xl bg-pine px-5 py-5 text-left text-pine-fg shadow-[var(--shadow-card)]"
                    : "rounded-2xl bg-cream px-5 py-5 text-left shadow-[var(--shadow-card)]"
                }
              >
                <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">Merchant bundle</p>
                <h3 className="mt-2 font-display text-2xl font-semibold">{bundle.name}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${isSelected ? "text-pine-fg/80" : "text-muted"}`}>
                  {bundle.description || "Prepaid Merchant Credit for approved property booking payments."}
                </p>
                <dl className="mt-4 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt>Purchase amount</dt>
                    <dd className="font-medium tabular-nums">{formatBdt(bundle.purchase_amount)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Purchased credit</dt>
                    <dd className="font-medium tabular-nums">{formatBdt(bundle.purchased_credit)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Bonus credit</dt>
                    <dd className="font-medium tabular-nums">{formatBdt(bundle.bonus_credit)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Total usable credit</dt>
                    <dd className="font-semibold tabular-nums">{formatBdt(total)}</dd>
                  </div>
                </dl>
                {bundle.gifts.length ? (
                  <p className={`mt-3 text-sm ${isSelected ? "text-pine-fg/80" : "text-muted"}`}>
                    Included: {bundle.gifts.map((g) => `${g.quantity} × ${g.label}`).join(", ")}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {selected ? (
        <Surface>
          <h2 className="font-display text-xl font-semibold">Terms & Conditions</h2>
          <p className="mt-2 text-sm text-muted">Version {selected.terms_version}. These terms are stored with your purchase and are not applied retroactively.</p>
          <div className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-paper p-4 text-sm leading-relaxed">
            {selected.terms}
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>I have read and accept these Terms & Conditions for this Merchant bundle.</span>
          </label>
          {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
          <Button className="mt-5 w-full sm:w-auto" disabled={pending || !accepted} onClick={() => void startPurchase()}>
            {pending ? "Starting…" : `Continue · ${formatBdt(selected.purchase_amount)}`}
          </Button>
        </Surface>
      ) : null}
    </div>
  );
}

function MerchantDashboard({
  userId,
  data,
  loading,
  pendingIncoming,
  canApprove,
  onReload,
}: {
  userId: string;
  data: Awaited<ReturnType<typeof api.myMerchant>> | undefined;
  loading: boolean;
  pendingIncoming: MerchantPaymentRequest[];
  canApprove: boolean;
  onReload: () => Promise<void>;
}) {
  const merchant = data?.merchant;
  const bundles = data?.bundles ?? [];
  const purchases = data?.purchases ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewBundle, setReviewBundle] = useState<MerchantBundle | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paying, setPaying] = useState<{ id: string; amount: number; name: string } | null>(null);
  const { data: paymentData, reload: reloadPayments } = useAsync(() => api.myPayments(), [userId], { enabled: Boolean(userId) });
  const payments = paymentData?.payments ?? [];
  const canBuy = merchant?.status === "active";

  const confirming = useMemo(
    () => pendingIncoming.find((r) => r.id === confirmId) ?? null,
    [pendingIncoming, confirmId],
  );

  async function decide(id: string, action: "approve" | "decline") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "approve") await api.approveMerchantRequest(id, crypto.randomUUID());
      else await api.declineMerchantRequest(id, crypto.randomUUID());
      setConfirmId(null);
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this request.");
    } finally {
      setBusyId(null);
    }
  }

  async function continueToPayment() {
    if (!reviewBundle) return;
    if (!accepted) {
      setError("Terms & Conditions must be accepted.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const { purchase } = await api.startMerchantPurchase(reviewBundle.id, true, crypto.randomUUID());
      setPaying({ id: purchase.id, amount: purchase.purchase_amount, name: purchase.bundle_name });
      setReviewBundle(null);
      setAccepted(false);
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start this Merchant bundle purchase.");
    } finally {
      setStarting(false);
    }
  }

  if (loading || !merchant) return <p className="text-sm text-muted">Loading Merchant dashboard…</p>;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant"
        title="Merchant"
        description="Merchant Credit is prepaid and non-withdrawable. It is not commission, Leadership Reward, or annual activation."
      />

      {merchant.status !== "active" ? (
        <Surface>
          <p className="text-sm text-muted">
            Merchant status is currently <StatusBadge status={merchant.status} />. History remains visible. New Pay by
            Merchant requests and approvals are available only while the account is active.
          </p>
        </Surface>
      ) : null}

      <Surface>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Your Merchant User ID</p>
        <p className="mt-2 break-all font-medium">{userId}</p>
        <p className="mt-2 text-sm text-muted">Share this ID so members can use Pay by Merchant on a pending booking.</p>
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available Merchant Credit" value={formatBdt(merchant.available)} hint="Usable for new approvals" />
        <StatCard label="Purchased credit" value={formatBdt(merchant.purchased_issued)} hint="Issued from confirmed bundles" />
        <StatCard label="Bonus credit" value={formatBdt(merchant.bonus_issued)} hint="Spendable bonus, separately audited" />
        <StatCard
          label="Reserved / settled"
          value={formatBdt(merchant.reserved + merchant.settled)}
          hint={`${formatBdt(merchant.reserved)} reserved · ${formatBdt(merchant.settled)} settled`}
        />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Available Merchant Bundles</h2>
        {bundles.length === 0 ? (
          <p className="text-sm text-muted">No active Merchant bundles are available right now.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {bundles.map((bundle) => {
              const total = bundle.purchased_credit + bundle.bonus_credit;
              const action = bundlePurchaseAction(bundle.id, purchases, payments);
              return (
                <Surface key={bundle.id}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Merchant bundle</p>
                  <h3 className="mt-2 font-display text-2xl font-semibold">{bundle.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {bundle.description || "Prepaid Merchant Credit for approved property booking payments."}
                  </p>
                  <dl className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt>Purchase amount</dt>
                      <dd className="font-medium tabular-nums">{formatBdt(bundle.purchase_amount)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Purchased Credit</dt>
                      <dd className="font-medium tabular-nums">{formatBdt(bundle.purchased_credit)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Bonus Credit</dt>
                      <dd className="font-medium tabular-nums">{formatBdt(bundle.bonus_credit)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Total Merchant Credit</dt>
                      <dd className="font-semibold tabular-nums">{formatBdt(total)}</dd>
                    </div>
                  </dl>
                  {bundle.gifts.length ? (
                    <p className="mt-3 text-sm text-muted">
                      Included gifts: {bundle.gifts.map((gift) => `${gift.quantity} × ${gift.label}`).join(", ")}
                    </p>
                  ) : null}
                  {canBuy ? (
                    action.openPayment && action.purchase ? (
                      <Button
                        className="mt-4"
                        onClick={() => {
                          setPaying({ id: action.purchase!.id, amount: action.purchase!.purchase_amount, name: action.purchase!.bundle_name });
                          setReviewBundle(null);
                          setError(null);
                        }}
                      >
                        {action.label}
                      </Button>
                    ) : action.label === "Buy Bundle" || action.label === "Buy Again" ? (
                      <Button
                        className="mt-4"
                        onClick={() => {
                          setReviewBundle(bundle);
                          setAccepted(false);
                          setPaying(null);
                          setError(null);
                        }}
                      >
                        {action.label}
                      </Button>
                    ) : (
                      <p className="mt-4 text-sm font-medium">{action.label}</p>
                    )
                  ) : (
                    <p className="mt-4 text-sm text-muted">Purchases are available only while this Merchant account is active.</p>
                  )}
                </Surface>
              );
            })}
          </div>
        )}
        {canBuy && reviewBundle ? (
          <Surface>
            <h3 className="font-display text-xl font-semibold">{reviewBundle.name}</h3>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Purchase amount</dt>
                <dd className="font-medium tabular-nums">{formatBdt(reviewBundle.purchase_amount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Purchased Credit</dt>
                <dd className="font-medium tabular-nums">{formatBdt(reviewBundle.purchased_credit)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Bonus Credit</dt>
                <dd className="font-medium tabular-nums">{formatBdt(reviewBundle.bonus_credit)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Total Merchant Credit</dt>
                <dd className="font-semibold tabular-nums">{formatBdt(reviewBundle.purchased_credit + reviewBundle.bonus_credit)}</dd>
              </div>
            </dl>
            {reviewBundle.gifts.length ? (
              <p className="mt-3 text-sm text-muted">
                Included gifts: {reviewBundle.gifts.map((gift) => `${gift.quantity} × ${gift.label}`).join(", ")}
              </p>
            ) : null}
            <h4 className="mt-5 font-medium">Terms & Conditions</h4>
            <p className="mt-2 text-sm text-muted">Version {reviewBundle.terms_version}. These terms are stored with this purchase and are not applied retroactively.</p>
            <div className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-paper p-4 text-sm leading-relaxed">
              {reviewBundle.terms}
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-4" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>I have read and accept these Terms & Conditions for this Merchant bundle.</span>
            </label>
            {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
            <Button className="mt-5" disabled={starting || !accepted} onClick={() => void continueToPayment()}>
              {starting ? "Starting…" : "Continue to Payment"}
            </Button>
          </Surface>
        ) : null}
        {canBuy && paying ? (
          <div className="space-y-3">
            <h3 className="font-display text-xl font-semibold">{paying.name}</h3>
            <PaymentForm
              targetType="merchant_bundle"
              targetId={paying.id}
              amount={paying.amount}
              onSubmitted={() => {
                setPaying(null);
                setReviewBundle(null);
                void reloadPayments();
                void onReload();
              }}
            />
          </div>
        ) : null}
      </section>

      {error && !reviewBundle ? <p className="text-sm text-clay">{error}</p> : null}

      {confirming ? (
        <Surface>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Confirm approval</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">Approve {formatBdt(confirming.amount)}?</h2>
          <p className="mt-2 text-sm text-muted">
            {confirming.customer_name ?? "Customer"} · {confirming.offer_title} · {confirming.purpose === "growth_activation" ? "Growth Program Activation" : confirming.booking_id}
          </p>
          <p className="mt-3 text-sm text-muted">
            {confirming.purpose === "growth_activation"
              ? "Approving settles this amount once and completes Growth Program Activation. No separate Darmelk approval is required."
              : "Approving settles this amount once and confirms the booking. Inventory is consumed once. Commission is not posted until activation. No separate Darmelk payment approval is required."}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button disabled={busyId === confirming.id} onClick={() => void decide(confirming.id, "approve")}>
              {busyId === confirming.id ? "Approving…" : `Approve ${formatBdt(confirming.amount)}`}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
          </div>
        </Surface>
      ) : null}

      <Surface>
        <h2 className="font-display text-xl font-semibold">Payment Requests</h2>
        {(data?.incomingRequests ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">No payment requests yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {[...(data?.incomingRequests ?? [])]
              .sort((a, b) => {
                const rank = (status: string) => (status === "pending" ? 0 : 1);
                const byStatus = rank(a.status) - rank(b.status);
                if (byStatus !== 0) return byStatus;
                return a.created_at < b.created_at ? 1 : -1;
              })
              .map((request) => (
              <li key={request.id} className="rounded-xl bg-paper p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{request.customer_name ?? request.customer_user_id}</p>
                    <p className="text-sm text-muted">
                      {request.purpose === "growth_activation" ? "Growth Program Activation" : "Growth Booking"}
                      {" · "}
                      {request.purpose === "growth_activation" ? "Activation" : request.offer_title || request.booking_id}
                    </p>
                    <p className="mt-1 text-xs text-subtle">{formatWhen(request.created_at)}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-display text-xl font-semibold tabular-nums">{formatBdt(request.amount)}</p>
                    <p className="mt-1 text-sm font-medium">{merchantRequestStatusLabel(request.status)}</p>
                  </div>
                </div>
                {request.status === "pending" ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {canApprove ? (
                      <>
                        <Button size="sm" disabled={busyId === request.id} onClick={() => setConfirmId(request.id)}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === request.id}
                          onClick={() => void decide(request.id, "decline")}
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted">Approvals are paused while this Merchant account is not active.</p>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Recent Activity</h2>
        {(data?.ledger ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">No Merchant Credit movements yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {data!.ledger.slice(0, 12).map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{labelEntry(entry.entry_type)}</p>
                  <p className="text-xs text-muted">{formatWhen(entry.created_at)}</p>
                </div>
                <p className="tabular-nums text-sm font-medium">{formatBdt(entry.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Bundle Purchase History</h2>
        {purchases.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No bundle purchases yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {purchases.map((purchase) => (
              <li key={purchase.id} className="rounded-xl bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{purchase.bundle_name}</p>
                    <p className="text-sm text-muted">{formatWhen(purchase.created_at)}</p>
                    <p className="mt-1 text-xs text-subtle">Purchase {purchase.id}</p>
                  </div>
                  <StatusBadge status={purchase.status} />
                </div>
                <dl className="mt-3">
                  <AmountRow label="Purchase amount" value={purchase.purchase_amount} compact />
                  <AmountRow label="Purchased Credit" value={purchase.purchased_credit} compact />
                  <AmountRow label="Bonus Credit" value={purchase.bonus_credit} compact />
                </dl>
                {purchase.gifts_snapshot.length ? (
                  <p className="mt-2 text-sm text-muted">
                    Gifts: {purchase.gifts_snapshot.map((gift) => `${gift.quantity} × ${gift.label}`).join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Gift Tracking</h2>
        {(data?.gifts ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">No gifts yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data!.gifts.map((gift) => (
              <li key={gift.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {gift.quantity} × {gift.gift_label}
                  </p>
                  <p className="text-sm text-muted">{gift.bundle_name}</p>
                  <p className="text-xs text-subtle">Purchase {gift.purchase_id}</p>
                  <p className="text-xs text-subtle">{formatWhen(gift.created_at)}</p>
                </div>
                <StatusBadge status={gift.status} />
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

function labelEntry(type: string) {
  switch (type) {
    case "purchased_credit_issued":
      return "Purchased credit issued";
    case "bonus_credit_issued":
      return "Bonus credit issued";
    case "booking_payment_reserved":
      return "Booking payment reserved";
    case "booking_payment_settled":
      return "Booking payment settled";
    case "activation_payment_reserved":
      return "Activation payment reserved";
    case "activation_payment_settled":
      return "Activation payment settled";
    case "reservation_released":
      return "Reservation released";
    case "reversal":
      return "Reversal";
    case "admin_adjustment":
      return "Admin adjustment";
    default:
      return type;
  }
}