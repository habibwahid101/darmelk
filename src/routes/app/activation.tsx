import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertBanner, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { api, ApiError } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { PaymentForm } from "@/components/payment-form";

const ACTIVATION_FEE = 1000;

export const Route = createFileRoute("/app/activation")({
  component: ActivationPage,
});

function ActivationPage() {
  const { member, reload } = useMemberSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const { data: activationData, reload: reloadActivations } = useAsync(() => api.myActivations(), [member?.user_id], { enabled: Boolean(member) });
  const { data: paymentData, reload: reloadPayments } = useAsync(() => api.myPayments(), [member?.user_id], { enabled: Boolean(member) });

  if (!member) return null;

  const canRequest =
    member.activation_status === "inactive" || member.activation_status === "expired";

  async function requestActivation() {
    setPending(true);
    setError(null);
    try {
      const { activation } = await api.requestActivation(crypto.randomUUID());
      setCreatedId(activation.id);
      reloadActivations();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request activation.");
    } finally {
      setPending(false);
    }
  }

  const pendingActivation = createdId ? activationData?.activations.find((a) => a.id === createdId) : activationData?.activations.find((a) => a.status === "pending");
  const submittedPayment = pendingActivation ? paymentData?.payments.find((p) => p.target_type === "activation" && p.target_id === pendingActivation.id && p.status !== "rejected") : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        kicker="Annual activation"
        title="Activate Your Darmelk ID"
        description="Sign up → member profile → payment submission → admin review → active for one year."
        action={<StatusBadge status={member.activation_status} />}
      />

      <AlertBanner tone="neutral" title={`Fee: ${formatBdt(ACTIVATION_FEE)} per year`}>
        Activation is separate from property booking, commission, and qualification benefit.
      </AlertBanner>

      <Surface>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Status</dt>
            <dd className="font-medium capitalize">{member.activation_status}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Expires</dt>
            <dd>{formatWhen(member.activation_expires_at)}</dd>
          </div>
        </dl>
        {error ? <p className="mt-4 text-sm text-clay">{error}</p> : null}
        {canRequest ? (
          <Button className="mt-6" onClick={() => void requestActivation()} disabled={pending}>
            {pending ? "Submitting…" : "Request annual activation"}
          </Button>
        ) : member.activation_status === "pending" && submittedPayment ? (
          <p className="mt-6 text-sm text-muted">
            Payment {submittedPayment.status.replace("_", " ")}. Activation begins only after admin approval.
          </p>
        ) : null}
      </Surface>
      {pendingActivation && !submittedPayment ? <PaymentForm targetType="activation" targetId={pendingActivation.id} amount={pendingActivation.amount} onSubmitted={()=>{reloadPayments();reloadActivations();}} /> : null}
    </div>
  );
}
