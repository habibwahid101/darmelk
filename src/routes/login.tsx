import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";
import { authClient, authEnabled } from "@/lib/auth/client";
import { api, ApiError } from "@/lib/api-client";
import { FLAGSHIP, formatBdt, getOffer } from "@/lib/offers";
import { cn } from "@/lib/utils";

type LoginSearch = {
  mode?: "create" | "signin";
  intent?: string;
  offer?: string;
  ref?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    mode: s.mode === "create" ? "create" : s.mode === "signin" ? "signin" : undefined,
    intent: typeof s.intent === "string" ? s.intent : undefined,
    offer: typeof s.offer === "string" ? s.offer : undefined,
    ref: typeof s.ref === "string" ? s.ref : undefined,
  }),
  component: Login,
});

function Login() {
  const { mode, intent, offer, ref } = Route.useSearch();
  const navigate = useNavigate();
  const [create, setCreate] = useState(mode === "create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [sponsorCode, setSponsorCode] = useState(ref ?? "");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = offer ? getOffer(offer) : intent === "book" ? FLAGSHIP : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (create) {
      if (!name.trim()) {
        setError("Enter your name.");
        return;
      }
      if (!sponsorCode.trim()) {
        setError("Sponsor referral code is required.");
        return;
      }
      if (!termsAccepted) {
        setError("Please accept the Terms & Conditions to continue.");
        return;
      }
    }
    setPending(true);
    try {
      if (create) {
        const lookup = await api.lookupSponsor(sponsorCode.trim());
        if (!lookup.ok) throw new Error("Sponsor code not found.");
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name.trim(),
        });
        if (err) throw new Error(err.message || "Could not create account");
        try {
          await api.onboarding({
            name: name.trim(),
            sponsorCode: sponsorCode.trim(),
            termsAccepted: true,
          });
        } catch (onboardErr) {
          await authClient.signOut().catch(() => undefined);
          throw onboardErr instanceof ApiError
            ? onboardErr
            : new Error("Account created, but the sponsor code could not be applied. Sign in and try again.");
        }
      } else {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) throw new Error(err.message || "Could not sign in");
      }
      if (intent === "book" && selected) {
        await navigate({ to: "/app/book/$slug", params: { slug: selected.slug } });
      } else {
        await navigate({ to: "/app" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="container-pg grid min-h-[100svh] place-items-center py-24">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-cream shadow-[var(--shadow-card)] lg:grid-cols-2">
        <div className="relative hidden min-h-[28rem] lg:block">
          <img src="/images/hero-platform.jpg" alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-ink/45" />
          <div className="relative flex h-full flex-col justify-end p-8 text-cream">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/70">Property first</p>
            <p className="mt-2 font-display text-3xl font-semibold">{create ? "Create your account" : "Welcome back"}</p>
            <p className="mt-3 max-w-sm text-sm text-cream/75 text-pretty">
              Review offer terms before you book. Progress, commission, and benefit stay separate.
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{create ? "Create account" : "Sign in"}</h1>
          <p className="mt-2 text-sm text-muted">
            {create ? "Register with your sponsor code to open the member dashboard." : "Continue to your member area."}
          </p>

          {selected ? (
            <div className="mt-5 rounded-xl bg-paper px-4 py-3 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Booking intent</p>
              <p className="mt-1 font-medium text-ink">{selected.title}</p>
              <p className="text-muted">Booking amount {formatBdt(selected.bookingAmount)}</p>
            </div>
          ) : null}

          {!authEnabled ? <p className="mt-6 text-sm text-muted">Sign-in is disabled.</p> : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            {create ? (
              <Field label="Full Name">
                <Input
                  id="full-name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </Field>
            ) : null}
            <Field label="Email">
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete={create ? "new-password" : "current-password"}
              required
              hint={create ? "At least 8 characters." : undefined}
            />
            {create ? (
              <>
                <Field label="Sponsor Referral Code" hint="Required. This relationship is permanent after registration.">
                  <Input
                    id="sponsor-code"
                    name="sponsorCode"
                    value={sponsorCode}
                    onChange={(e) => setSponsorCode(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoComplete="off"
                    required
                  />
                </Field>
                <label className="flex items-start gap-3 rounded-xl bg-paper px-3 py-3 text-sm leading-relaxed text-ink">
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
                    </Link>
                    .
                  </span>
                </label>
              </>
            ) : null}
            {error ? <p className="text-sm text-clay">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending || !authEnabled}>
              {pending ? "Please wait…" : create ? "Create account" : "Sign in"}
            </Button>
          </form>

          {!create ? (
            <p className="mt-3 text-center text-sm">
              <Link to="/forgot-password" className="text-pine hover:underline">
                Forgot password?
              </Link>
            </p>
          ) : null}

          <p className="mt-5 text-center text-sm text-muted">
            {create ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className={cn("font-medium text-pine hover:underline")}
              onClick={() => {
                setCreate((v) => !v);
                setError(null);
              }}
            >
              {create ? "Sign in" : "Create account"}
            </button>
          </p>
          <p className="mt-4 text-center text-xs text-subtle">
            <Link to="/properties" className="hover:text-ink">
              Back to properties
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
