import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { FLAGSHIP, formatBdt } from "@/lib/offers";
import { formatWhen, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/app/bookings")({ component: BookingsPage });

function BookingsPage() {
  const { member } = useMemberSession();
  const bookings = usePlatform((s) => s.bookings.filter((b) => b.userId === member?.userId));
  if (!member) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="My bookings"
        title="Property bookings"
        description="Each row is an offer you requested. Amounts are specific to that offer."
        action={
          <Button asChild>
            <Link to="/properties">Browse offers</Link>
          </Button>
        }
      />

      {bookings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No bookings yet"
          description="Published offers show retail value, booking amount, and qualification benefit before you start."
          action={
            <Button asChild>
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                View flagship offer
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                to="/app/bookings/$id"
                params={{ id: b.id }}
                className="grid gap-4 rounded-2xl bg-cream p-4 shadow-[var(--shadow-card)] sm:grid-cols-[7.5rem_1fr_auto] sm:items-center"
              >
                <img src={b.image} alt="" className="aspect-[16/11] rounded-xl object-cover sm:h-20 sm:w-full sm:aspect-auto" />
                <div className="min-w-0">
                  <p className="font-display text-xl font-semibold">{b.offerTitle}</p>
                  <p className="mt-1 text-sm text-muted">
                    Booked {formatBdt(b.bookingAmount)} · {formatWhen(b.createdAt)}
                  </p>
                </div>
                <StatusBadge status={b.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
