import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SuccessBanner } from "@/components/states";
import { authEnabled } from "@/lib/auth/client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "/reset-password" }),
      });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; status?: boolean }
        | null;
      if (!res.ok) {
        throw new Error(
          data?.message ||
            "Password reset email is not enabled on this workspace. Sign in with Google or X, or use your existing password.",
        );
      }
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Password reset email is not available. Use Google or X sign-in, or contact operations.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="container-pg grid min-h-[100svh] place-items-center py-24">
      <div className="w-full max-w-md rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
        <h1 className="font-display text-2xl font-semibold">Forgot password</h1>
        <p className="mt-2 text-sm text-muted">
          If reset email is enabled and an account exists, a link will be sent. Otherwise use
          Google or X sign-in.
        </p>
        {done ? (
          <div className="mt-6 space-y-4">
            <SuccessBanner
              title="Request sent"
              description="Check that inbox. If no email arrives, use Google or X sign-in instead."
            />
            <Button asChild variant="secondary" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email" error={error ?? undefined}>
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={pending || !authEnabled}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm text-muted">
              <Link to="/login" className="text-pine hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
