import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, MapPin } from "lucide-react";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { fromApiJob, isJobOpen } from "@/lib/jobs";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/career/")({ component: CareerPage });

function CareerPage() {
  const { data, loading } = useAsync(() => api.jobs(), []);
  const jobs = (data?.jobs ?? []).map(fromApiJob).filter((job) => isJobOpen(job));

  return (
    <div className="container-pg pb-20 pt-24 md:pt-28">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-pine">Darmelk</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">Career</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted text-pretty">
        Join the team that presents Darmelk’s property opportunities with clarity. Roles here are corporate positions — not property offers.
      </p>

      <section className="mt-10">
        {loading && !data ? (
          <p className="text-sm text-muted">Loading openings…</p>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No openings right now"
            description="There are no published roles at the moment. Please check back, or reach the Darmelk team through Contact Us."
          />
        ) : (
          <ul className="grid min-w-0 gap-4">
            {jobs.map((job) => (
              <li key={job.slug}>
                <article className="flex min-w-0 flex-col gap-4 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Badge>{job.department}</Badge>
                      <Badge>{job.employmentType}</Badge>
                    </div>
                    <h2 className="mt-3 font-display text-2xl font-semibold text-pretty">{job.title}</h2>
                    <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-muted">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">{job.location}</span>
                    </p>
                    {job.applicationDeadline ? (
                      <p className="mt-1 text-sm text-subtle">Apply by {formatWhen(job.applicationDeadline)}</p>
                    ) : null}
                  </div>
                  <Button asChild variant="secondary" className="w-full shrink-0 sm:w-auto">
                    <Link to="/career/$slug" params={{ slug: job.slug }}>
                      View details
                    </Link>
                  </Button>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
