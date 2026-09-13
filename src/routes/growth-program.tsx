import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useMemberSession } from "@/components/layout/use-member";
import { api, ApiError } from "@/lib/api-client";
import { GROWTH_PROGRAM_PATH, isGrowthParticipant } from "@/lib/growth";

export const Route = createFileRoute("/growth-program")({
  component: GrowthProgramGateway,
});

function GrowthProgramGateway() {
  const { user, member, isPending } = useMemberSession();
  const [sponsorCode, setSponsorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (isPending) {
    return (
      <main className="container-pg grid min-h-[70svh] place-items-center py-24">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: GROWTH_PROGRAM_PATH }} />;
  }

  if (!member) return <RedirectToSignIn />;

  if (isGrowthParticipant(member)) {
    if (member.activation_status === "active") {
      return <Navigate to="/app" />;
    }
    return <Navigate to="/app/activation" />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = sponsorCode.trim();
    if (!trimmed) {
      setError("Referral ID is required to join the Growth Program.");
      return;
    }
    setPending(true);
    try {
      const lookup = await api.lookupSponsor(trimmed);
      if (!lookup.ok) throw new Error("Referral ID not found.");
      const { member: bound } = await api.bindGrowthSponsor({ sponsorCode: trimmed });
      const dest = bound.activation_status === "active" ? "/app" : "/app/activation";
      window.location.assign(dest);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not join the Growth Program.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="container-pg grid min-h-[100svh] place-items-center py-24">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">Growth Program</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Join the Growth Program</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
          To join the Growth Program, a valid Referral ID is required. This relationship is permanent once confirmed.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <Field
            label="Referral ID"
            hint="Required. Enter the Referral ID of the member who invited you."
            error={error ?? undefined}
            htmlFor="growth-referral"
          >
            <Input
              id="growth-referral"
              name="sponsorCode"
              value={sponsorCode}
              onChange={(e) => {
                setSponsorCode(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              required
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "growth-referral-error" : undefined}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : "Continue"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          <Link to="/app" className="font-medium text-pine hover:underline">
            Back to account
          </Link>
        </p>
      </div>
    </main>
  );
}
