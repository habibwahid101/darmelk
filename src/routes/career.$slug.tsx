import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { JobArticle } from "@/components/job-article";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { fromApiJob } from "@/lib/jobs";

export const Route = createFileRoute("/career/$slug")({
  loader: async ({ params }) => {
    try {
      const { job } = await api.job(params.slug);
      return { job: fromApiJob(job) };
    } catch {
      throw notFound();
    }
  },
  component: JobDetailPage,
});

function JobDetailPage() {
  const { job } = Route.useLoaderData();

  return (
    <div className="container-pg max-w-3xl pb-20 pt-24 md:pt-28">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-pine">Career</p>
      <div className="mt-6">
        <JobArticle job={job} showApply />
      </div>
      <Button asChild variant="secondary" className="mt-8">
        <Link to="/career">All openings</Link>
      </Button>
    </div>
  );
}
