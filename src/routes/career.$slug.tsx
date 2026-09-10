import { createFileRoute, notFound } from "@tanstack/react-router";
import { JobArticle } from "@/components/job-article";
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
    <div className="container-pg max-w-3xl pb-20 pt-10 md:pt-14">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-pine">Career</p>
      <div className="mt-4">
        <JobArticle job={job} showApply showBack />
      </div>
    </div>
  );
}
