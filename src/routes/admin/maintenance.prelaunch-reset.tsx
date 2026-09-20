import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertBanner, LoadingState, PageHeader, StatCard, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { prelaunchResetExecute, prelaunchResetPreview } from "@/lib/prelaunch-reset-api";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/maintenance/prelaunch-reset")({
  component: PrelaunchResetPage,
});

const CONFIRMATION = "RESET DARMELK PRELAUNCH DATA";

function PrelaunchResetPage() {
  const { data, loading, error, reload } = useAsync(() => prelaunchResetPreview(), []);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof prelaunchResetExecute>> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canSubmit = typed === CONFIRMATION && !busy && data && !data.already_clean && !result;

  const counts = useMemo(() => {
    if (!data) return [];
    return [
      ["Admin members", data.preserved_admins.length],
      ["Non-admin members", data.non_admin_members.length],
      ["Auth-only non-admin users", data.auth_only_non_admin_users],
      ["Bookings", data.reset_sensitive_counts.bookings ?? 0],
      ["Inventory events", data.reset_sensitive_counts.offer_inventory_events ?? 0],
      ["Flagship sold", data.flagship.sold],
      ["Commission ledger", data.reset_sensitive_counts.commission_ledger ?? 0],
      ["Withdrawals", data.reset_sensitive_counts.withdrawals ?? 0],
      ["Activations", data.reset_sensitive_counts.annual_activations ?? 0],
      ["Admin actions", data.reset_sensitive_counts.admin_actions ?? 0],
      ["Offers", data.preserve_catalog_counts.offers ?? 0],
      ["Migrations", data.preserve_catalog_counts._migrations ?? 0],
    ] as Array<[string, number]>;
  }, [data]);

  async function execute() {
    if (typed !== CONFIRMATION) return;
    setBusy(true);
    setActionError(null);
    try {
      const executed = await prelaunchResetExecute(CONFIRMATION);
      setResult(executed);
      await reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Reset failed";
      setActionError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Maintenance"
        title="One-time prelaunch reset"
        description="This clears prelaunch member and transaction rows from the active production database. Catalog, migrations, and the working admin account stay. This cannot be undone in this database."
      />
      <AlertBanner tone="danger" title="Irreversible in the active production database">
        Normal Darmelk ledgers stay append-only. This page is the owner-authorized one-time prelaunch clean reset only. Type the exact phrase to enable execution.
      </AlertBanner>
      {loading && !data ? <LoadingState label="Loading live preview…" /> : null}
      {error ? (
        <AlertBanner tone="danger" title="Preview failed">
          {error.message}
        </AlertBanner>
      ) : null}
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {counts.slice(0, 8).map(([label, value]) => (
              <StatCard key={label} label={label} value={String(value)} />
            ))}
          </div>
          <Surface>
            <p className="font-display text-xl font-semibold">Preserved admin</p>
            <ul className="mt-3 space-y-2 text-sm">
              {data.preserved_admins.map((admin: any) => (
                <li key={admin.user_id}>
                  {admin.masked_email} · {admin.role} · auth {admin.auth_user_present ? "yes" : "no"} · accounts {admin.account_rows} · sessions {admin.session_rows}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">{data.ledger_notice}</p>
          </Surface>
        </>
      ) : null}
      {result ? (
        <>
          <AlertBanner tone="ok" title="Reset completed">
            Flagship sold is now {result.after.flagship_sold}. Admin members {result.after.admin_members}. Non-admin members {result.after.non_admin_members}. Audit rows {result.after.reset_audit_count}.
          </AlertBanner>
          <Surface>
            <p className="font-display text-xl font-semibold">Before / after counts</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {[
                ["Non-admin members", result.before.non_admin_members.length, result.after.non_admin_members],
                ["Auth-only non-admin users", result.before.auth_only_non_admin_users, result.after.auth_only_non_admin_users],
                ["Bookings", result.before.reset_sensitive_counts.bookings ?? 0, result.after.reset_sensitive_counts.bookings ?? 0],
                ["Inventory events", result.before.reset_sensitive_counts.offer_inventory_events ?? 0, result.after.reset_sensitive_counts.offer_inventory_events ?? 0],
                ["Flagship sold", result.before.flagship.sold, result.after.flagship_sold],
                ["Commission ledger", result.before.reset_sensitive_counts.commission_ledger ?? 0, result.after.reset_sensitive_counts.commission_ledger ?? 0],
                ["Admin actions", result.before.reset_sensitive_counts.admin_actions ?? 0, result.after.reset_sensitive_counts.admin_actions ?? 0],
                ["Offers preserved", result.before.preserve_catalog_counts.offers ?? 0, result.after.preserve_catalog_counts.offers ?? 0],
                ["Migrations preserved", result.before.preserve_catalog_counts._migrations ?? 0, result.after.preserve_catalog_counts._migrations ?? 0],
              ].map(([label, before, after]) => (
                <p key={String(label)}>
                  {label}: {before} → {after}
                </p>
              ))}
            </div>
          </Surface>
        </>
      ) : null}
      {data?.already_clean ? (
        <AlertBanner tone="ok" title="Already clean">
          A second execution is refused.
        </AlertBanner>
      ) : null}
      {actionError ? (
        <AlertBanner tone="danger" title="Execution refused">
          {actionError}
        </AlertBanner>
      ) : null}
      {!result && data && !data.already_clean ? (
        <Surface className="space-y-4">
          <p className="font-display text-xl font-semibold">Confirm execution</p>
          <p className="text-sm text-muted">
            Type <span className="font-medium text-ink">{CONFIRMATION}</span> then run the reset.
          </p>
          <input
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-pine"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="button" disabled={!canSubmit} onClick={() => void execute()}>
            {busy ? "Resetting…" : "Execute one-time prelaunch reset"}
          </Button>
        </Surface>
      ) : null}
    </div>
  );
}
