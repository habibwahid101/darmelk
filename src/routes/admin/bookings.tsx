import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBdt } from "@/lib/offers";
import {
  formatWhen,
  memberById,
  usePlatform,
  type BookingStatus,
} from "@/lib/platform";

export const Route = createFileRoute("/admin/bookings")({
  component: AdminBookings,
});

function AdminBookings() {
  const bookings = usePlatform((s) => s.bookings);
  const members = usePlatform((s) => s.members);
  const adminSetBookingStatus = usePlatform((s) => s.adminSetBookingStatus);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Operations"
        title="Bookings"
        description="Confirming a booking uses that offer’s actual booking amount for any upline commission. Reversed rows stay in history."
      />

      {bookings.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No bookings"
          description="Member booking requests will appear here for review."
        />
      ) : (
        <Surface className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {bookings.map((b) => {
              const user = memberById(members, b.userId);
              return (
                <li key={b.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{b.offerTitle}</p>
                      <p className="text-sm text-muted">
                        {user?.name ?? "Member"} · {formatBdt(b.bookingAmount)} · {formatWhen(b.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["pending", "confirmed", "activated", "cancelled", "reversed"] as BookingStatus[]).map(
                      (status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={b.status === status ? "primary" : "secondary"}
                          onClick={() => adminSetBookingStatus(b.id, status)}
                        >
                          {status}
                        </Button>
                      ),
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </div>
  );
}
