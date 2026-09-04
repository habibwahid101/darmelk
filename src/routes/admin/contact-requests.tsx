import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, type ContactRequest } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatWhen } from "@/lib/platform";

export const Route = createFileRoute("/admin/contact-requests")({
  component: AdminContactRequests,
});

function AdminContactRequests() {
  const { data, reload, loading } = useAsync(() => api.admin.contactRequests(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requests = data?.requests ?? [];

  async function setStatus(row: ContactRequest, status: ContactRequest["status"]) {
    setPendingId(row.id);
    setError(null);
    try {
      await api.admin.updateContactRequest(row.id, status);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Inbox"
        title="Contact Requests"
        description="Public Contact Us submissions. Update status after review — records are retained."
      />
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted">Loading requests…</p>
      ) : requests.length === 0 ? (
        <EmptyState icon={Inbox} title="No contact requests" description="New public submissions appear here." />
      ) : (
        <Surface className="overflow-x-auto p-0 sm:p-0">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Profession</th>
                <th className="px-4 py-3 font-medium">Mobile</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {requests.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-muted">{row.profession}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.mobile}</td>
                  <td className="px-4 py-3 text-muted">{row.location}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatWhen(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="secondary" onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                      {openId === row.id ? "Hide" : "View"}
                    </Button>
                    {openId === row.id ? (
                      <div className="mt-3 space-y-2 rounded-xl bg-paper p-3">
                        <p className="text-xs text-muted">Submitted {formatWhen(row.created_at)}</p>
                        <div className="flex flex-wrap gap-2">
                          {(["new", "reviewed", "closed"] as const).map((status) => (
                            <Button
                              key={status}
                              size="sm"
                              variant={row.status === status ? "primary" : "secondary"}
                              disabled={pendingId === row.id}
                              onClick={() => void setStatus(row, status)}
                            >
                              {status === "new" ? "New" : status === "reviewed" ? "Reviewed" : "Closed"}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}
    </div>
  );
}
