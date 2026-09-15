import { createFileRoute, Link } from "@tanstack/react-router";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

export const Route = createFileRoute("/faq")({ component: FaqPage });

const marketplace = [
  [
    "Do I need an account to explore properties?",
    "No. You can browse published properties and submit a Request to Book as a guest.",
  ],
  [
    "What does Request to Book mean?",
    "It tells Darmelk you are interested in a property. Our team contacts you about the opportunity and next steps. It does not confirm a booking, reserve the property, or start a payment.",
  ],
  [
    "How do I start?",
    "Browse published properties, review the details, and submit a Request to Book. No account is required to enquire.",
  ],
  [
    "What information is shown for a property?",
    "Published opportunities show the property name, location, category, property value, booking amount, and approved supporting materials. Terms that are not stored yet are not invented on the page.",
  ],
] as const;

const program = [
  [
    "How does Growth Program Activation work?",
    "Growth Program Activation costs BDT 1,000 per year. Submit payment evidence for admin review. Growth privileges begin only after approval and pause after expiry until renewal. A Darmelk account stays free.",
  ],
  [
    "How does qualification work?",
    "Qualification requires 3 personal sponsors and completion through Level 5. L1 = 3, L2 = 9, L3 = 27, L4 = 81, and L5 = 243. The cumulative L1–L5 total is 363; Level 5 itself is 243.",
  ],
  [
    "How are commissions calculated?",
    "L1–L5 rates are 10%, 8%, 6%, 4%, and 2%. Each commission uses the actual eligible confirmed booking amount. Commission and the qualification benefit are separate.",
  ],
  [
    "When can I withdraw?",
    "You need an active Growth Program period, at least one own confirmed or activated booking, sufficient available commission, and a saved payout method. The minimum is BDT 1,000 and the fee is 2.5%.",
  ],
  [
    "How are payments approved?",
    "Growth Program Activation and booking payments are manual. Submit the transaction reference and proof; an admin reviews and approves or rejects the submission. Submission is not instant approval.",
  ],
  [
    "What happens when Growth Program Activation expires?",
    "Your account, history, network, balances, and existing qualification records remain. Applicable sponsoring, earning, Growth booking, and withdrawal privileges pause until renewal is approved.",
  ],
] as const;

function FaqGroup({
  title,
  items,
  idPrefix,
}: {
  title: string;
  items: readonly (readonly [string, string])[];
  idPrefix: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold text-pretty">{title}</h2>
      <Accordion.Root type="single" collapsible className="mt-4 divide-y divide-line rounded-2xl bg-cream px-5">
        {items.map(([q, a], i) => (
          <Accordion.Item key={q} value={`${idPrefix}-${i}`}>
            <Accordion.Header>
              <Accordion.Trigger className="flex w-full min-w-0 items-center justify-between gap-4 py-5 text-left font-medium">
                <span className="min-w-0 text-pretty">{q}</span>
                <ChevronDown className="size-4 shrink-0" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="pb-5 text-sm leading-relaxed text-muted">{a}</Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}

function FaqPage() {
  return (
    <main className="container-pg py-28 md:py-32">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[.18em] text-pine">FAQ</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-pretty">Property questions, plainly answered</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted text-pretty">
          Start with how to explore properties and request to book. Growth Program mechanics remain documented below.
        </p>
        <FaqGroup title="Exploring properties" items={marketplace} idPrefix="market" />
        <FaqGroup title="Growth Program" items={program} idPrefix="program" />
        <p className="mt-6 text-sm text-muted">
          For the authoritative product rules, read{" "}
          <Link to="/program-rules" className="font-medium text-pine hover:underline">
            Program Rules
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
