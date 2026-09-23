import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertBanner, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TermsAccept } from "@/components/terms-accept";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { api, ApiError } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { PaymentForm, describePaymentOptions } from "@/components/payment-form";
import { isGrowthParticipant } from "@/lib/growth";

const ACTIVATION_FEE = 1000;

export const Route = createFileRoute("/app/activation")({
  component: ActivationPage,
});

function ActivationPage() {
  const { member, reload } = useMemberSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const { data: activationData, reload: reloadActivations } = useAsync(() => api.myActivations(), [member?.user_id], { enabled: Boolean(member) });
  const { data: paymentData, reload: reloadPayments } = useAsync(() => api.myPayments(), [member?.user_id], { enabled: Boolean(member) });
  const { data: merchantData, reload: reloadMerchant } = useAsync(() => api.myMerchant(), [member?.user_id], { enabled: Boolean(member) });
  const { data: optionData } = useAsync(() => api.paymentOptions("activation"), []);

  if (!member) return null;
  if (!isGrowthParticipant(member)) return <Navigate to="/growth-program" />;

  const canRequest =
    member.activation_status === "inactive" || member.activation_status === "expired";
  const termsReady = Boolean(accepted.GROWTH_PROGRAM_TERMS && accepted.GROWTH_ACTIVATION_TERMS);

  async function requestActivation() {
    setPending(true);
    setError(null);
    try {
      const { activation } = await api.requestActivation(crypto.randomUUID(), true);
      setCreatedId(activation.id);
      reloadActivations();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request Growth Program Activation.");
    } finally {
      setPending(false);
    }
  }

  const pendingActivation = createdId ? activationData?.activations.find((a) => a.id === createdId) : activationData?.activations.find((a) => a.status === "pending");
  const submittedPayment = pendingActivation ? paymentData?.payments.find((p) => p.target_type === "activation" && p.target_id === pendingActivation.id && p.status !== "rejected") : undefined;
  const merchantRequest = pendingActivation
    ? merchantData?.outgoingRequests.find((request) => request.activation_id === pendingActivation.id && ["pending", "approved", "settled"].includes(request.status))
    : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        kicker="Growth Program"
        title="Growth Program Activation"
        description="Annual activation applies to Growth Program privileges only. A Darmelk account stays free."
        action={<StatusBadge status={member.activation_status} />}
      />

      <AlertBanner tone="neutral" title={`${formatBdt(ACTIVATION_FEE)} / year`}>
        Growth access is optional. Your referral is already linked. Payment requires verification and does not activate Growth privileges on its own.
      </AlertBanner>

      <Surface>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Growth status</dt>
            <dd className="font-medium capitalize">{member.activation_status === "active" ? "Growth Program Active" : member.activation_status}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Expires</dt>
            <dd>{formatWhen(member.activation_expires_at)}</dd>
          </div>
        </dl>
        {member.activation_status === "active" ? (
          <p className="mt-6 text-sm text-muted">
            Growth Program Active until {formatWhen(member.activation_expires_at)}. Historical network and ledger records remain if this period later expires.
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-clay" role="alert">{error}</p> : null}
        {canRequest ? (
          <div className="mt-6 space-y-5">
            <TermsAccept
              items={[
                { key: "GROWTH_PROGRAM_TERMS", label: "Growth Program Terms", href: "/terms?key=growth-program" },
                { key: "GROWTH_ACTIVATION_TERMS", label: "Growth Activation Terms", href: "/terms?key=growth-activation" },
              ]}
              accepted={accepted}
              onChange={(key, value) => setAccepted((current) => ({ ...current, [key]: value }))}
              statement="I have read and agree to the Growth Program Terms and Growth Activation Terms."
            />
            <Button className="w-full min-h-11" onClick={() => void requestActivation()} disabled={pending || !termsReady}>
              {pending ? "Submitting…" : member.activation_status === "expired" ? "Request Growth Program renewal" : "Request Growth Program Activation"}
            </Button>
          </div>
        ) : member.activation_status === "pending" && (submittedPayment || merchantRequest) ? (
          <p className="mt-6 text-sm text-muted">
            Activation payment submitted for verification. Growth Program privileges begin only after admin approval.
          </p>
        ) : null}
      </Surface>
      {pendingActivation && !submittedPayment && !merchantRequest ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{describePaymentOptions(optionData?.options, "activation")}</p>
          <PaymentForm targetType="activation" targetId={pendingActivation.id} amount={pendingActivation.amount} onSubmitted={() => { reloadPayments(); reloadActivations(); reloadMerchant(); }} />
        </div>
      ) : null}
      <p className="text-center text-sm text-muted">
        <Link to="/app" className="font-medium text-pine hover:underline">Back to account</Link>
      </p>
    </div>
  );
}
