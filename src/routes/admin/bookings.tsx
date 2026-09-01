import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBdt } from "@/lib/offers";
import { formatWhen } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/bookings")({
  component: AdminBookings,
});

function AdminBookings() {
  const { data, reload } = useAsync(() => api.admin.bookings(), []);
  const bookings = data?.bookings ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      reload();
    } finally {
      setBusyId(null);
    }
  }

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
            {bookings.map((b) => (
              <li key={b.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{b.offer_title ?? b.offer_slug}</p>
                    <p className="text-sm text-muted">
                      {formatBdt(b.booking_amount)} · {formatWhen(b.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.status === "pending" ? <p className="text-sm text-muted">Awaiting payment review.</p> : null}
                  {b.status === "confirmed" ? (
                    <Button
                      size="sm"
                      disabled={busyId === b.id}
                      onClick={() => void run(b.id, () => api.admin.activateBooking(b.id))}
                    >
                      Activate
                    </Button>
                  ) : null}
                  {b.status === "pending" || b.status === "confirmed" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === b.id}
                      onClick={() => void run(b.id, () => api.admin.cancelBooking(b.id))}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  {b.status === "confirmed" || b.status === "activated" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === b.id}
                      onClick={() => {
                        const reason = window.prompt("Reason for reversal");
                        if (reason) void run(b.id, () => api.admin.reverseBooking(b.id, reason));
                      }}
                    >
                      Reverse
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
