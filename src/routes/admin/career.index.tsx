import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { fromApiJob } from "@/lib/jobs";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/career/")({ component: AdminCareer });

function AdminCareer() {
  const { data, reload, loading } = useAsync(() => api.admin.jobs(), []);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobs = (data?.jobs ?? []).map(fromApiJob);

  async function setStatus(slug: string, status: "published" | "draft" | "closed") {
    setPending(`${slug}:${status}`);
    setError(null);
    try {
      await api.admin.setJobStatus(slug, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update job status.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="People"
        title="Career Management"
        description="Create and publish Darmelk roles. Applications are received by email only."
        action={
          <Button asChild size="sm">
            <Link to="/admin/career/new">Add job</Link>
          </Button>
        }
      />
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <EmptyState icon={Briefcase} title="No jobs yet" description="Add a draft role, then publish it when the description and application email are ready." />
      ) : (
        <Surface className="overflow-x-auto p-0 sm:p-0">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((job) => (
                <tr key={job.slug} className="align-top">
                  <td className="px-4 py-3">
                    <p className="max-w-[16rem] font-medium text-pretty">{job.title}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">{job.department}</td>
                  <td className="px-4 py-3 text-muted">{job.location}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{job.employmentType}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatWhen(job.applicationDeadline)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatWhen(job.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/admin/career/$slug" params={{ slug: job.slug }}>
                          Edit
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/admin/career/$slug/preview" params={{ slug: job.slug }}>
                          Preview
                        </Link>
                      </Button>
                      {job.status === "published" ? (
                        <>
                          <Button size="sm" variant="secondary" disabled={pending === `${job.slug}:draft`} onClick={() => void setStatus(job.slug, "draft")}>
                            Unpublish
                          </Button>
                          <Button size="sm" variant="secondary" disabled={pending === `${job.slug}:closed`} onClick={() => void setStatus(job.slug, "closed")}>
                            Close
                          </Button>
                        </>
                      ) : job.status === "closed" ? (
                        <Button size="sm" variant="secondary" disabled={pending === `${job.slug}:published`} onClick={() => void setStatus(job.slug, "published")}>
                          Reopen
                        </Button>
                      ) : (
                        <Button size="sm" disabled={pending === `${job.slug}:published`} onClick={() => void setStatus(job.slug, "published")}>
                          Publish
                        </Button>
                      )}
                    </div>
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
