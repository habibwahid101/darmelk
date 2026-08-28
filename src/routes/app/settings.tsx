import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { signOut } from "@/lib/auth/client";
import { formatWhen, memberById, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { member } = useMemberSession();
  const members = usePlatform((s) => s.members);
  const updateProfile = usePlatform((s) => s.updateProfile);
  const navigate = useNavigate();
  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [saved, setSaved] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!member) return null;
  const userId = member.userId;
  const fallbackName = member.name;
  const sponsor = memberById(members, member.sponsorUserId);

  function save(e: React.FormEvent) {
    e.preventDefault();
    updateProfile(userId, { name: name.trim() || fallbackName, phone: phone.trim() });
    setSaved(true);
  }

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
      <PageHeader kicker="Account" title="Profile & settings" description="Keep this record accurate. Sponsor assignment is not edited here." />

      <Surface>
        <form onSubmit={save} className="space-y-4">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" hint="Managed by sign-in. Not editable here.">
            <Input value={member.email} disabled readOnly />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </Field>
          <Button type="submit">Save profile</Button>
          {saved ? <p className="text-sm text-ok">Saved.</p> : null}
        </form>
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Membership</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Referral code" value={member.referralCode} />
          <Row label="Sponsor" value={sponsor ? `${sponsor.name} · ${sponsor.referralCode}` : "None"} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Activation</dt>
            <dd>
              <StatusBadge status={member.activationStatus} />
            </dd>
          </div>
          <Row label="Member since" value={formatWhen(member.createdAt)} />
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
