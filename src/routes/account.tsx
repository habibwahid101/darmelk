import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  FileText,
  Layers3,
  ShieldCheck,
  Sprout,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FLAGSHIP, formatBdt } from "@/lib/offers";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="container-pg py-32">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-ink/10" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-ink/5" />
          ))}
        </div>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const name = user.displayName ?? user.primaryEmail ?? "Member";

  return (
    <main className="container-pg pt-28 pb-20">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">
        Member area
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
        Welcome, {name}
      </h1>
      <p className="mt-3 max-w-xl text-sm text-muted">
        Track bookings, direct sponsors, level progress, and documents. Booking,
        commission, and property benefit remain separate.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Cell
          icon={Building2}
          label="My bookings"
          value="None yet"
          hint="Start with the flagship hotel share"
          action={
            <Button asChild size="sm" className="mt-4">
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                View flagship offer
              </Link>
            </Button>
          }
        />
        <Cell
          icon={Sprout}
          label="Direct sponsors"
          value="0 / 3"
          hint="Personally sponsor 3 confirmed bookings"
        />
        <Cell
          icon={Layers3}
          label="Level progress"
          value="Not started"
          hint="L1 3 · L2 9 · L3 27 · L4 81 · L5 243"
        />
        <Cell
          icon={Wallet}
          label="Available commission"
          value={formatBdt(0)}
          hint="Calculated from actual confirmed booking amounts"
        />
        <Cell
          icon={ShieldCheck}
          label="Qualification status"
          value="Not qualified"
          hint="Requires 3 directs and a complete Level 5"
        />
        <Cell
          icon={FileText}
          label="Property documents"
          value="—"
          hint="Appear after a confirmed booking"
        />
      </div>
    </main>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  hint,
  action,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" strokeWidth={1.75} />
        <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      {action}
    </article>
  );
}
