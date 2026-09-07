import { createFileRoute, Link } from "@tanstack/react-router";
import { JobArticle } from "@/components/job-article";
import { PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { fromApiJob } from "@/lib/jobs";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/career/$slug/preview")({ component: AdminJobPreview });

function AdminJobPreview() {
  const { slug } = Route.useParams();
  const { data, loading, error } = useAsync(() => api.admin.job(slug), [slug]);
  const job = data?.job ? fromApiJob(data.job) : undefined;

  if (loading && !job) return <p className="text-sm text-muted">Loading preview…</p>;
  if (error || !job) return <p className="text-sm text-clay">{error?.message ?? "Job not found."}</p>;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Preview"
        title={job.title}
        description="Admin preview uses the current saved job. Drafts stay hidden from the public Career page."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/admin/career/$slug" params={{ slug }}>
                Edit
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/admin/career">All jobs</Link>
            </Button>
          </div>
        }
      />
      <JobArticle job={job} showApply />
    </div>
  );
}
