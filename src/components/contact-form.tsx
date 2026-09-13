import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";

export function ContactForm({
  property,
}: {
  property?: { slug: string; title: string };
}) {
  const requestToBook = Boolean(property);
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
      await api.submitContact({
        name,
        profession,
        mobile,
        location,
        ...(property
          ? { offerSlug: property.slug, source: "request_to_book" as const }
          : { source: "contact" as const }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your request. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)]">
        <p className="font-display text-2xl font-semibold text-pretty" role="status">
          Request received
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
          {requestToBook
            ? `Your request has been received. Our team will contact you regarding ${property?.title ?? "the property"} and next steps. This does not confirm a booking or reserve the property.`
            : "Thank you. Your details have been recorded. Our team will review your request."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {property ? (
            <Button asChild variant="secondary">
              <Link to="/properties/$slug" params={{ slug: property.slug }}>
                Back to property
              </Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link to={requestToBook ? "/properties" : "/"}>
              {requestToBook ? "Browse properties" : "Back to home"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)]">
      {property ? (
        <div className="rounded-xl bg-paper px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Selected property</p>
          <p className="mt-1 font-display text-lg font-semibold text-pretty">{property.title}</p>
        </div>
      ) : null}
      <Field label="Name" htmlFor="contact-name">
        <Input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </Field>
      <Field label="Profession" htmlFor="contact-profession">
        <Input
          id="contact-profession"
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          required
        />
      </Field>
      <Field label="Mobile" htmlFor="contact-mobile">
        <Input
          id="contact-mobile"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          autoComplete="tel"
          inputMode="tel"
          required
        />
      </Field>
      <Field label="Location" htmlFor="contact-location">
        <Input
          id="contact-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          autoComplete="address-level2"
          required
        />
      </Field>
      {error ? (
        <p className="text-sm text-clay" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Submitting…" : requestToBook ? "Submit request" : "Submit"}
      </Button>
    </form>
  );
}
