import { createFileRoute } from "@tanstack/react-router";
import { Download, Share2 } from "lucide-react";
import { EmptyState, LoadingState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/foundation-registry")({
  component: AdminFoundationRegistry,
});

function csvEscape(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function AdminFoundationRegistry() {
  const { data, loading, error } = useAsync(() => api.admin.foundationRegistry(), []);
  const rows = data?.rows ?? [];

  function download(kind: "json" | "csv") {
    if (!data) return;
    const body =
      kind === "json"
        ? JSON.stringify({ readOnly: true, rowCount: data.rowCount, rows: data.rows }, null, 2)
        : [
            "label,login_email,referral_code,referral_url,level,sponsor_label,network_parent_label,slot",
            ...data.rows.map((r) =>
              [
                r.label,
                r.loginEmail,
                r.referralCode,
                r.referralUrl,
                r.level,
                r.sponsorLabel,
                r.networkParentLabel,
                r.slot,
              ]
                .map(csvEscape)
                .join(","),
            ),
          ].join("\n");
    const blob = new Blob([body], { type: kind === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = kind === "json" ? "darmelk-foundation-registry.json" : "darmelk-foundation-registry.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Foundation"
        title="121-ID registry"
        description="Read-only Habib Wahid foundation accounts. Export does not include passwords, hashes, sessions, or secrets."
      />
      {loading && !data ? (
        <LoadingState label="Loading foundation registry…" />
      ) : error ? (
        <EmptyState icon={Share2} title="Unable to load registry" description={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Share2} title="No foundation accounts" description="The 121-ID registry is empty in this environment." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">
              {data?.rowCount} rows · validation {data?.validation.ok ? "PASS" : "FAIL"} · L0 {data?.validation.byLevel[0]} · L1{" "}
              {data?.validation.byLevel[1]} · L2 {data?.validation.byLevel[2]} · L3 {data?.validation.byLevel[3]} · L4{" "}
              {data?.validation.byLevel[4]}
            </p>
            <Button type="button" variant="secondary" onClick={() => download("csv")}>
              <Download className="size-4" />
              Download CSV
            </Button>
            <Button type="button" variant="secondary" onClick={() => download("json")}>
              <Download className="size-4" />
              Download JSON
            </Button>
          </div>
          <Surface className="p-0 sm:p-0">
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-[0.14em] text-subtle">
                  <tr>
                    <th className="px-4 py-3 font-medium">Label</th>
                    <th className="px-4 py-3 font-medium">Login email</th>
                    <th className="px-4 py-3 font-medium">Referral code</th>
                    <th className="px-4 py-3 font-medium">Referral URL</th>
                    <th className="px-4 py-3 font-medium">Level</th>
                    <th className="px-4 py-3 font-medium">Sponsor</th>
                    <th className="px-4 py-3 font-medium">Network parent</th>
                    <th className="px-4 py-3 font-medium">Slot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.referralCode}>
                      <td className="px-4 py-3 font-medium">{row.label}</td>
                      <td className="px-4 py-3 text-muted">{row.loginEmail}</td>
                      <td className="px-4 py-3">{row.referralCode}</td>
                      <td className="px-4 py-3 break-all text-xs text-muted">{row.referralUrl}</td>
                      <td className="px-4 py-3">{row.level}</td>
                      <td className="px-4 py-3 text-muted">{row.sponsorLabel ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{row.networkParentLabel ?? "—"}</td>
                      <td className="px-4 py-3">{row.slot ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
