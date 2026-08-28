import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Surface } from "@/components/states";
import { COMMISSION_LEVELS, TOTAL_POSITIONS, formatBdt } from "@/lib/offers";
import { ACTIVATION_FEE, PERSONAL_SPONSOR_TARGET } from "@/lib/platform";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Operating rules"
        description="Financial rules are not editable in this console. Shown here so operators can verify them."
      />
      <Surface>
        <dl className="space-y-3 text-sm">
          <Row label="Personal sponsors" value={String(PERSONAL_SPONSOR_TARGET)} />
          <Row
            label="3×5"
            value={COMMISSION_LEVELS.map((l) => `L${l.level} ${l.positions}`).join(" · ")}
          />
          <Row label="Total positions" value={String(TOTAL_POSITIONS)} />
          <Row
            label="Commission rates"
            value={COMMISSION_LEVELS.map((l) => `${Math.round(l.rate * 100)}%`).join(" / ")}
          />
          <Row label="Commission base" value="Each source booking’s actual confirmed amount" />
          <Row label="Qualification benefit" value="Member’s own booked offer" />
          <Row label="Annual activation" value={formatBdt(ACTIVATION_FEE)} />
        </dl>
      </Surface>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium sm:text-right">{value}</dd>
    </div>
  );
}
