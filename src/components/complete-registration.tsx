import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";

/**
 * Recovery for a Better Auth identity that has no members row.
 * Does not create a second identity and does not assign a sponsor until the
 * referral validates inside onboarding.
 */
export function CompleteRegistration({
  name,
  onDone,
}: {
  name?: string | null;
  onDone: () => void;
}) {
  const [sponsorCode, setSponsorCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = sponsorCode.trim();
    if (!trimmed) {
      setError("Referral ID is required.");
      return;
    }
    if (!termsAccepted) {
      setError("Please accept the Terms & Conditions to continue.");
      return;
    }
    setPending(true);
    try {
      await api.lookupSponsor(trimmed);
      await api.onboarding({
        name: name?.trim() || undefined,
        sponsorCode: trimmed,
        termsAccepted: true,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Registration could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="container-pg grid min-h-[70svh] place-items-center py-10">
      <div className="w-full max-w-lg rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">Incomplete registration</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Finish creating your account</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
          This sign-in is not a Darmelk member yet. An active Referral ID is required before a member record can be created.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Referral ID" hint="Required. Enter an active Referral ID." htmlFor="complete-referral">
            <Input
              id="complete-referral"
              name="sponsorCode"
              value={sponsorCode}
              onChange={(e) => setSponsorCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              required
              aria-required="true"
            />
          </Field>
          <label className="flex min-h-11 items-start gap-3 rounded-xl bg-paper px-3 py-3 text-sm leading-relaxed text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-pine)]"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              required
            />
            <span>
              I have read, understood, and agree to the{" "}
              <Link to="/terms" className="font-medium text-pine underline-offset-2 hover:underline">
                Terms & Conditions
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="font-medium text-pine underline-offset-2 hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {error ? (
            <p className="text-sm text-clay" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : "Complete registration"}
          </Button>
        </form>
      </div>
    </main>
  );
}
