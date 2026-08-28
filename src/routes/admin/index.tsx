import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { CATEGORIES, formatBdt, OFFERS } from "@/lib/offers";
import { isQualified, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/")({ component: AdminOverview });

function AdminOverview() {
  const members = usePlatform((s) => s.members);
  const bookings = usePlatform((s) => s.bookings);
  const commissions = usePlatform((s) => s.commissions);

  const published = OFFERS.filter((o) => o.status === "available").length;
  const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "activated").length;
  const pending = bookings.filter((b) => b.status === "pending").length;
  const active = members.filter((m) => m.activationStatus === "active").length;
  const qualified = members.filter((m) => isQualified(members, bookings, m.userId)).length;
  const commPending = commissions.filter((c) => c.status === "pending").reduce((n, c) => n + c.amount, 0);
  const commAvailable = commissions.filter((c) => c.status === "available").reduce((n, c) => n + c.amount, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Operations"
        title="Admin overview"
        description="Figures below come from this environment’s real records. Empty stays empty — nothing is invented."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Members" value={String(members.length)} hint={`${active} with active annual activation`} />
        <StatCard label="Published offers" value={String(published)} hint={`${CATEGORIES.filter((c) => !c.available).length} categories coming soon`} />
        <StatCard label="Bookings" value={String(bookings.length)} hint={`${confirmed} confirmed · ${pending} pending`} />
        <StatCard label="Qualified members" value={String(qualified)} hint="3 personal eligible sponsors + complete Level 5" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Pending commission" value={formatBdt(commPending)} hint="From actual source booking amounts" />
        <StatCard label="Available commission" value={formatBdt(commAvailable)} />
      </div>

      <Surface className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-xl font-semibold">Work queue</p>
          <p className="mt-1 text-sm text-muted">Review pending bookings and activation requests.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/admin/bookings">Bookings</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/admin/activation">Activation</Link>
          </Button>
        </div>
      </Surface>
    </div>
  );
}
