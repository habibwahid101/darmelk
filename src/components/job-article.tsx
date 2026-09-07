import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { applyMailto, isJobOpen, type CareerJob } from "@/lib/jobs";
import { formatWhen } from "@/lib/platform";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function JobMeta({ job }: { job: CareerJob }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <Badge>{job.department}</Badge>
      <Badge>{job.employmentType}</Badge>
      {job.status === "closed" ? <Badge>Closed</Badge> : null}
      {job.status === "draft" ? <Badge>Draft</Badge> : null}
    </div>
  );
}

export function JobArticle({ job, showApply }: { job: CareerJob; showApply?: boolean }) {
  const open = isJobOpen(job);
  const canApply = job.status === "draft" ? Boolean(applyMailto(job)) : open;
  const mailto = showApply && canApply ? applyMailto(job) : null;

  return (
    <div className="space-y-6">
      <JobMeta job={job} />
      <div>
        <h1 className="font-display text-3xl font-semibold text-pretty sm:text-4xl">{job.title}</h1>
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{job.location}</span>
        </p>
        {job.applicationDeadline ? (
          <p className="mt-2 text-sm text-muted">Apply by {formatWhen(job.applicationDeadline)}</p>
        ) : null}
      </div>
      {showApply ? (
        mailto ? (
          <div className="space-y-2">
            <Button asChild className="w-full sm:w-auto">
              <a href={mailto}>Apply via Email</a>
            </Button>
            {job.applicationEmail ? (
              <p className="min-w-0 break-all text-sm text-muted">{job.applicationEmail}</p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-muted shadow-[var(--shadow-card)]">
            This role is no longer accepting applications.
          </p>
        )
      ) : null}
      {job.description ? (
        <Block title="Job description">
          <p className="whitespace-pre-wrap text-pretty">{job.description}</p>
        </Block>
      ) : null}
      {job.responsibilities?.length ? (
        <Block title="Responsibilities">
          <Lines items={job.responsibilities} />
        </Block>
      ) : null}
      {job.requirements?.length ? (
        <Block title="Requirements">
          <Lines items={job.requirements} />
        </Block>
      ) : null}
      {job.skills?.length ? (
        <Block title="Required skills">
          <Lines items={job.skills} />
        </Block>
      ) : null}
      {job.education || job.experience || job.compensation || job.workingHours || job.vacancy ? (
        <Block title="Role information">
          <dl className="grid gap-3 sm:grid-cols-2">
            {job.vacancy ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-subtle">Vacancy</dt>
                <dd>{job.vacancy}</dd>
              </div>
            ) : null}
            {job.compensation ? (
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-subtle">Salary / compensation</dt>
                <dd className="break-words">{job.compensation}</dd>
              </div>
            ) : null}
            {job.education ? (
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-subtle">Education</dt>
                <dd className="break-words">{job.education}</dd>
              </div>
            ) : null}
            {job.experience ? (
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-subtle">Experience</dt>
                <dd className="break-words">{job.experience}</dd>
              </div>
            ) : null}
            {job.workingHours ? (
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-subtle">Working hours</dt>
                <dd className="break-words">{job.workingHours}</dd>
              </div>
            ) : null}
          </dl>
        </Block>
      ) : null}
      {job.benefits?.length ? (
        <Block title="Benefits">
          <Lines items={job.benefits} />
        </Block>
      ) : null}
    </div>
  );
}
