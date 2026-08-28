import { cn } from "@/lib/utils";

const TONES = {
  pending: "bg-mist text-gold",
  ok: "bg-pine/12 text-pine-deep",
  danger: "bg-clay/12 text-clay",
  muted: "bg-ink/6 text-muted",
} as const;

const MAP: Record<string, { label: string; tone: keyof typeof TONES }> = {
  pending: { label: "Pending", tone: "pending" },
  confirmed: { label: "Confirmed", tone: "ok" },
  activated: { label: "Activated", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "muted" },
  reversed: { label: "Reversed", tone: "danger" },
  available: { label: "Available", tone: "ok" },
  paid: { label: "Paid", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
  inactive: { label: "Inactive", tone: "muted" },
  active: { label: "Active", tone: "ok" },
  expired: { label: "Expired", tone: "danger" },
  posted: { label: "Posted", tone: "ok" },
  qualified: { label: "Qualified", tone: "ok" },
  "not-qualified": { label: "Not qualified", tone: "muted" },
  "coming-soon": { label: "Coming soon", tone: "muted" },
  admin: { label: "Admin", tone: "ok" },
  member: { label: "Member", tone: "muted" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const mapped = MAP[status] ?? { label: status, tone: "muted" as const };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide",
        TONES[mapped.tone],
        className,
      )}
    >
      {mapped.label}
    </span>
  );
}