import { createFileRoute } from "@tanstack/react-router";
import { AlertBanner, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { ACTIVATION_FEE, formatWhen, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/app/activation")({
  component: ActivationPage,
});

function ActivationPage() {
  const { member } = useMemberSession();
  const requestActivation = usePlatform((s) => s.requestActivation);
  if (!member) return null;

  const canRequest =
    member.activationStatus === "inactive" || member.activationStatus === "expired";

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Annual activation"
        title="Account activation"
        description="Activation keeps the member record current. It is not a property purchase, commission, or qualification benefit."
        action={<StatusBadge status={member.activationStatus} />}
      />

      <AlertBanner tone="neutral" title={`Fee: ${formatBdt(ACTIVATION_FEE)} per year`}>
        Visually and conceptually separate from booking amount, commission, and hospitality yield.
      </AlertBanner>

      <Surface>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Status</dt>
            <dd className="font-medium capitalize">{member.activationStatus}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Requested</dt>
            <dd>{formatWhen(member.activationRequestedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Expires</dt>
            <dd>{formatWhen(member.activationExpiresAt)}</dd>
          </div>
        </dl>
        {canRequest ? (
          <Button className="mt-6" onClick={() => requestActivation(member.userId)}>
            Request annual activation
          </Button>
        ) : member.activationStatus === "pending" ? (
          <p className="mt-6 text-sm text-muted">
            Request submitted. Operations will mark the year as active when processed.
          </p>
        ) : null}
      </Surface>
    </div>
  );
}
