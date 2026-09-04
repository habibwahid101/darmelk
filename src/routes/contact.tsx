import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
});

function ContactPage() {
  const [name, setName] = useState("");
  const [profession, setProfession] = useState("");
  const [mobile, setMobile] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.submitContact({ name, profession, mobile, location });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your request. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="container-pg max-w-xl py-24 md:py-28">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-pine">Contact</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Contact Us</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
        Share a few details and the Darmelk team will review your request. This form is stored on your member operations record — it does not send email.
      </p>

      {done ? (
        <div className="mt-8 rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)]">
          <p className="font-display text-2xl font-semibold">Request received</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">Thank you. Your details have been recorded.</p>
          <Button asChild className="mt-6">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)]">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Profession">
            <Input value={profession} onChange={(e) => setProfession(e.target.value)} required />
          </Field>
          <Field label="Mobile">
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel" inputMode="tel" required />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} autoComplete="address-level2" required />
          </Field>
          {error ? <p className="text-sm text-clay">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Submitting…" : "Submit"}
          </Button>
        </form>
      )}
    </main>
  );
}
