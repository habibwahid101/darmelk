import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { JobForm, formFromJob, payloadFromJobForm } from "@/components/admin/job-form";
import { PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { fromApiJob } from "@/lib/jobs";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/career/$slug/")({ component: AdminEditJob });

function AdminEditJob() {
  const { slug } = Route.useParams();
  const { data, reload, loading, error: loadError } = useAsync(() => api.admin.job(slug), [slug]);
  const job = data?.job ? fromApiJob(data.job) : undefined;
  const [form, setForm] = useState(() => (job ? formFromJob(job) : null));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (job) setForm(formFromJob(job));
  }, [job?.slug, job?.updatedAt]);

  async function save() {
    if (!form) return;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.admin.updateJob(slug, payloadFromJobForm(form));
      setSaved(true);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save job.");
    } finally {
      setPending(false);
    }
  }

  async function setStatus(status: "published" | "draft" | "closed") {
    setPending(true);
    setError(null);
    try {
      await api.admin.setJobStatus(slug, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.");
    } finally {
      setPending(false);
    }
  }

  if (loading && !job) return <p className="text-sm text-muted">Loading job…</p>;
  if (loadError || !job || !form) {
    return <p className="text-sm text-clay">{loadError?.message ?? "Job not found."}</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="People"
        title={job.title}
        description="Edits apply to the public Career page after you publish. Applications stay email-only."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link to="/admin/career/$slug/preview" params={{ slug }}>
                Preview
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/admin/career">All jobs</Link>
            </Button>
          </div>
        }
      />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <StatusBadge status={job.status} />
        {job.status === "published" ? (
          <>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => void setStatus("draft")}>
              Unpublish
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => void setStatus("closed")}>
              Close
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => void setStatus("published")}>
            Publish
          </Button>
        )}
      </div>
      {saved ? <p className="text-sm text-ok">Saved.</p> : null}
      <JobForm value={form} onChange={setForm} onSubmit={() => void save()} pending={pending} error={error} slugLocked submitLabel="Save changes" />
    </div>
  );
}
