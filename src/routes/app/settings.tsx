import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { signOut } from "@/lib/auth/client";
import { formatWhen } from "@/lib/platform";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { user, member } = useMemberSession();
  const navigate = useNavigate();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!member) return null;

  async function out() {
    setSigningOut(true);
    try {
      await signOut();
      await navigate({ to: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        kicker="Account"
        title="Profile & settings"
        description="Keep this record accurate. Sponsor assignment is not edited here."
      />

      <Surface>
        <div className="space-y-4">
          <Field label="Full name">
            <Input value={user?.displayName ?? ""} disabled readOnly />
          </Field>
          <Field label="Email" hint="Managed by sign-in. Not editable here.">
            <Input value={user?.primaryEmail ?? ""} disabled readOnly />
          </Field>
          <Field label="Phone" hint="Set during onboarding.">
            <Input value={member.phone} disabled readOnly />
          </Field>
        </div>
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Membership</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Referral code" value={member.referral_code} />
          <Row label="Sponsor" value={member.sponsor_user_id ? "Assigned" : "None"} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Activation</dt>
            <dd>
              <StatusBadge status={member.activation_status} />
            </dd>
          </div>
          <Row label="Member since" value={formatWhen(member.created_at)} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Role</dt>
            <dd>
              <StatusBadge status={member.role} />
            </dd>
          </div>
        </dl>
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Sign out</h2>
        <p className="mt-2 text-sm text-muted">Ends this session on this device.</p>
        {confirmOut ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void out()} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Confirm sign out"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOut(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="mt-4" onClick={() => setConfirmOut(true)}>
            Sign out
          </Button>
        )}
      </Surface>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
