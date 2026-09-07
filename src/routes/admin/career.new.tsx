import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { JobForm, emptyJobForm, payloadFromJobForm } from "@/components/admin/job-form";
import { PageHeader } from "@/components/states";
import { api, ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/admin/career/new")({ component: AdminNewJob });

function AdminNewJob() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyJobForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const { job } = await api.admin.createJob({ ...payloadFromJobForm(form, { includeSlug: true }), status: "draft" });
      await navigate({ to: "/admin/career/$slug", params: { slug: job.slug } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create job.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader kicker="People" title="Add job" description="Saved as a draft until you publish it. Drafts are not public." />
      <JobForm value={form} onChange={setForm} onSubmit={() => void save()} pending={pending} error={error} submitLabel="Save draft" />
    </div>
  );
}
