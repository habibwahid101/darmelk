import { createFileRoute } from "@tanstack/react-router";
import { ContactForm } from "@/components/contact-form";
import { api } from "@/lib/api-client";
import { fromApiOffer, getOffer } from "@/lib/offers";
import { useAsync } from "@/lib/use-async";

type ContactSearch = { intent?: "book"; offer?: string };

export const Route = createFileRoute("/contact")({
  validateSearch: (s: Record<string, unknown>): ContactSearch => ({
    intent: s.intent === "book" ? "book" : undefined,
    offer: typeof s.offer === "string" && s.offer.trim() ? s.offer.trim() : undefined,
  }),
  component: ContactPage,
});

function ContactPage() {
  const { intent, offer: offerSlug } = Route.useSearch();
  const requestToBook = intent === "book" && Boolean(offerSlug);
  const { data } = useAsync(() => api.offer(offerSlug!), [offerSlug], { enabled: requestToBook });
  const fallback = offerSlug ? getOffer(offerSlug) : undefined;
  const property =
    requestToBook && offerSlug
      ? {
          slug: offerSlug,
          title: (data?.offer ? fromApiOffer(data.offer) : fallback)?.title ?? offerSlug,
        }
      : undefined;

  return (
    <main className="container-pg max-w-xl py-24 md:py-28">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-pine">
        {requestToBook ? "Request to Book" : "Contact"}
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-pretty">
        {requestToBook ? "Tell us you are interested" : "Contact Us"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
        {requestToBook
          ? "Share a few details and Darmelk will contact you about this property. This is an enquiry — it does not confirm a booking, reserve the property, or start a payment."
          : "Share a few details and the Darmelk team will review your request. This form is stored for follow-up — it does not send email."}
      </p>
      <ContactForm property={property} />
    </main>
  );
}
