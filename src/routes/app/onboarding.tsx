import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/states";
import { useMemberSession } from "@/components/layout/use-member";
import { formatBdt } from "@/lib/offers";
import { api, ApiError } from "@/lib/api-client";

const ACTIVATION_FEE = 1000;

export const Route = createFileRoute("/app/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const { member, reload } = useMemberSession();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [sponsor, setSponsor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!member) return null;
  const myCode = member.referral_code;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter the name that should appear on your member record.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.onboarding({ name: name.trim(), phone: phone.trim(), sponsorCode: sponsor.trim() || undefined });
      reload();
      await navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <PageHeader
        kicker="Welcome"
        title="Set up your member record"
        description="Short and factual. You can edit contact details later. Annual activation is separate from booking."
      />
      <Surface>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name" error={error && !name.trim() ? error : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Phone" hint="Optional. Used only on your member record.">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
            />
          </Field>
          <Field
            label="Sponsor referral code"
            hint="Optional. Cross-offer sponsorship is supported. Leave blank if you have no sponsor yet."
          >
            <Input
              value={sponsor}
              onChange={(e) => setSponsor(e.target.value)}
              placeholder="PG-XXXXXX"
              autoCapitalize="characters"
            />
          </Field>
          {error && name.trim() ? <p className="text-sm text-clay">{error}</p> : null}
          <div className="rounded-xl bg-paper px-4 py-3 text-sm text-muted">
            Annual activation is {formatBdt(ACTIVATION_FEE)} and does not purchase a property.
            Your code after setup: <span className="font-medium text-ink">{myCode}</span>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Continue to overview"}
          </Button>
        </form>
      </Surface>
    </div>
  );
}
