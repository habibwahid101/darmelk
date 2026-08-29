import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertBanner, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { api, ApiError } from "@/lib/api-client";

const ACTIVATION_FEE = 1000;

export const Route = createFileRoute("/app/activation")({
  component: ActivationPage,
});

function ActivationPage() {
  const { member, reload } = useMemberSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!member) return null;

  const canRequest =
    member.activation_status === "inactive" || member.activation_status === "expired";

  async function requestActivation() {
    setPending(true);
    setError(null);
    try {
      await api.requestActivation(crypto.randomUUID());
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request activation.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        kicker="Annual activation"
        title="Account activation"
        description="Activation keeps the member record current. It is not a property purchase, commission, or qualification benefit."
        action={<StatusBadge status={member.activation_status} />}
      />

      <AlertBanner tone="neutral" title={`Fee: ${formatBdt(ACTIVATION_FEE)} per year`}>
        Visually and conceptually separate from booking amount, commission, and hospitality yield.
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
        ) : member.activation_status === "pending" ? (
          <p className="mt-6 text-sm text-muted">
            Request submitted. Operations will mark the year as active when processed.
          </p>
        ) : null}
      </Surface>
    </div>
  );
}
