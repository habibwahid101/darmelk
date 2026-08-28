import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { SuccessBanner } from "@/components/states";
import { authClient, authEnabled } from "@/lib/auth/client";

type Search = { token?: string };

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (!token) {
      setError("This reset link is missing a token. Request a new one.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { error: err } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (err) throw new Error(err.message || "Could not reset password");
      setDone(true);
      window.setTimeout(() => {
        void navigate({ to: "/login" });
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="container-pg grid min-h-[100svh] place-items-center py-24">
      <div className="w-full max-w-md rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
        <h1 className="font-display text-2xl font-semibold">Reset password</h1>
        {done ? (
          <div className="mt-6">
            <SuccessBanner title="Password updated" description="Continue to sign in." />
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
              error={error ?? undefined}
              hint="At least 8 characters."
            />
            <Button type="submit" className="w-full" disabled={pending || !authEnabled}>
              {pending ? "Saving…" : "Update password"}
            </Button>
            <p className="text-center text-sm">
              <Link to="/forgot-password" className="text-pine hover:underline">
                Request a new link
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
