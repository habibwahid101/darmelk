import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { isQualified, memberById, primaryBooking, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers });

function AdminUsers() {
  const members = usePlatform((s) => s.members);
  const bookings = usePlatform((s) => s.bookings);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Members"
        title="Users"
        description="Records created when someone signs in on this environment. No dummy members."
      />
      {members.length === 0 ? (
        <EmptyState icon={Users} title="No members" description="Users appear after they create an account." />
      ) : (
        <Surface className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {members.map((m) => {
              const booking = primaryBooking(bookings, m.userId);
              const sponsor = memberById(members, m.sponsorUserId);
              return (
                <li key={m.userId} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <p className="font-medium">{m.name}</p>
                    <StatusBadge status={m.role} />
                    <StatusBadge status={m.activationStatus} />
                    <StatusBadge status={isQualified(members, bookings, m.userId) ? "qualified" : "not-qualified"} />
                  </div>
                  <p className="text-sm text-muted">{m.email || "No email"}</p>
                  <p className="text-xs text-subtle">
                    Code {m.referralCode} · Sponsor {sponsor?.name ?? "none"} · Booking{" "}
                    {booking ? `${booking.offerTitle} (${booking.status})` : "none"}
                  </p>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </div>
  );
}
