import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useState } from "react";
import { EmptyState, LoadingState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBdt } from "@/lib/offers";
import { api, type Booking } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/bookings")({
  component: AdminBookings,
});

const STATUS_RANK: Record<Booking["status"], number> = {
  pending: 0,
  confirmed: 1,
  activated: 2,
  cancelled: 3,
  reversed: 4,
};

function formatBookingWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });
}

function paymentRail(status?: string | null) {
  if (status === "pending" || status === "approved" || status === "settled") return "Pay by Merchant";
  return "Darmelk Bank";
}

function AdminBookings() {
  const { data, reload, loading } = useAsync(() => api.admin.bookings(), []);
  const bookings = [...(data?.bookings ?? [])].sort((a, b) => {
    const byStatus = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return b.created_at.localeCompare(a.created_at);
  });
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
        description="Merchant approval confirms a Pay by Merchant booking. Bank payments are still confirmed in Payment review. Activating a confirmed booking posts commission. Reversed rows stay in history."
      />

      {loading && !data ? (
        <LoadingState label="Loading bookings…" />
      ) : bookings.length === 0 ? (
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
                  <div className="min-w-0">
                    <p className="font-medium">{b.user_name || "Member"}</p>
                    <p className="text-sm text-muted">
                      {b.user_email ? `${b.user_email} · ` : ""}
                      {formatBookingWhen(b.created_at)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {b.offer_title ?? b.offer_slug} · {formatBdt(b.booking_amount)} · {paymentRail(b.merchant_request_status)}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                {b.status === "pending" ? (
                  <p className="text-sm text-muted">
                    {b.merchant_request_status === "approved"
                      ? "This Merchant-approved booking was not auto-completed. It still needs owner review and was not changed by this release."
                      : b.merchant_request_status === "pending"
                        ? "Awaiting Merchant approval."
                        : "Awaiting payment review."}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {b.status === "confirmed" ? (
                    <Button
                      size="sm"
                      className="shrink-0"
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
                      className="shrink-0"
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
                      className="shrink-0"
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
