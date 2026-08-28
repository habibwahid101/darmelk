import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { FLAGSHIP, formatBdt, getOffer } from "@/lib/offers";
import { cn } from "@/lib/utils";

type LoginSearch = {
  mode?: "create" | "signin";
  intent?: string;
  offer?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    mode: s.mode === "create" ? "create" : s.mode === "signin" ? "signin" : undefined,
    intent: typeof s.intent === "string" ? s.intent : undefined,
    offer: typeof s.offer === "string" ? s.offer : undefined,
  }),
  component: Login,
});

function Login() {
  const { mode, intent, offer } = Route.useSearch();
  const navigate = useNavigate();
  const [create, setCreate] = useState(mode === "create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = offer ? getOffer(offer) : intent === "book" ? FLAGSHIP : undefined;
  const callbackURL = "/account";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (create) {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0] || "Member",
        });
        if (err) throw new Error(err.message || "Could not create account");
      } else {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) throw new Error(err.message || "Could not sign in");
      }
      await navigate({ to: "/account" });
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
          <img
            src="/images/hero-hotel.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-ink/45" />
          <div className="relative flex h-full flex-col justify-end p-8 text-cream">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/70">
              Property first
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {create ? "Create your account" : "Welcome back"}
            </p>
            <p className="mt-3 max-w-sm text-sm text-cream/75">
              Review offer terms before you book. Progress, commission, and
              benefit stay separate.
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {create ? "Create account" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {create
              ? "Save bookings and track 3×5 progress in one place."
              : "Continue to your member area."}
          </p>

          {selected ? (
            <div className="mt-5 rounded-xl bg-paper px-4 py-3 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                Booking intent
              </p>
              <p className="mt-1 font-medium text-ink">{selected.title}</p>
              <p className="text-muted">
                Booking amount {formatBdt(selected.bookingAmount)}
              </p>
            </div>
          ) : null}

          {authEnabled ? (
            <div className="mt-6 space-y-3">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => signIn(p.providerId, { callbackURL })}
                >
                  Continue with {p.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">Sign-in is disabled.</p>
          )}

          <div className="relative my-6">
            <div className="h-px bg-line" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-cream px-3 text-[11px] uppercase tracking-wide text-subtle">
              Email
            </span>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {create ? (
              <Field
                label="Full name"
                value={name}
                onChange={setName}
                autoComplete="name"
              />
            ) : null}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={create ? "new-password" : "current-password"}
              required
            />
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending || !authEnabled}>
              {pending ? "Please wait…" : create ? "Create account" : "Sign in"}
            </Button>
          </form>

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

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-ink/80">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-lg bg-paper px-3 text-sm text-ink shadow-[0_0_0_1px_rgb(26_25_22/0.12)] outline-none transition-[box-shadow] duration-150 placeholder:text-subtle focus:shadow-[0_0_0_2px_var(--color-pine)]"
      />
    </label>
  );
}
