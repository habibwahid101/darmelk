import { createFileRoute, Link } from "@tanstack/react-router";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

export const Route = createFileRoute("/faq")({ component: FaqPage });
const rows = [
  ["How does activation work?", "Annual activation costs BDT 1,000. Submit payment evidence for admin review. Active-member privileges begin only after approval and pause after expiry until renewal."],
  ["How does qualification work?", "Qualification requires 3 personal sponsors and completion through Level 5. L1 = 3, L2 = 9, L3 = 27, L4 = 81, and L5 = 243. The cumulative L1–L5 total is 363; Level 5 itself is 243."],
  ["How are commissions calculated?", "L1–L5 rates are 10%, 8%, 6%, 4%, and 2%. Each commission uses the actual eligible confirmed booking amount. Commission and the qualification benefit are separate."],
  ["When can I withdraw?", "You need an active ID, at least one own confirmed or activated booking, sufficient available commission, and a saved payout method. The minimum is BDT 1,000 and the fee is 2.5%."],
  ["How are payments approved?", "Activation and booking payments are manual. Submit the transaction reference and proof; an admin reviews and approves or rejects the submission. Submission is not instant approval."],
  ["What happens when activation expires?", "Your account, history, network, balances, and existing qualification records remain. Applicable sponsoring, earning, booking, and withdrawal privileges pause until renewal is approved."],
];
function FaqPage(){return <main className="container-pg py-28 md:py-32"><div className="mx-auto max-w-3xl"><p className="text-xs font-medium uppercase tracking-[.18em] text-pine">FAQ</p><h1 className="mt-3 font-display text-4xl font-semibold">Program mechanics, plainly explained</h1><Accordion.Root type="single" collapsible className="mt-8 divide-y divide-line rounded-2xl bg-cream px-5">{rows.map(([q,a],i)=><Accordion.Item key={q} value={`q-${i}`}><Accordion.Header><Accordion.Trigger className="flex w-full items-center justify-between gap-4 py-5 text-left font-medium">{q}<ChevronDown className="size-4"/></Accordion.Trigger></Accordion.Header><Accordion.Content className="pb-5 text-sm leading-relaxed text-muted">{a}</Accordion.Content></Accordion.Item>)}</Accordion.Root><p className="mt-6 text-sm text-muted">For the authoritative product rules, read <Link to="/program-rules" className="font-medium text-pine hover:underline">Program Rules</Link>.</p></div></main>}
