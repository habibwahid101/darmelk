import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { applyMailto, isJobOpen, type CareerJob } from "@/lib/jobs";
import { formatWhen } from "@/lib/platform";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-4 max-w-prose text-[15px] leading-[1.75] text-muted">{children}</div>
    </section>
  );
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => (
        <li key={item} className="break-words">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className="mt-1 break-words text-[15px] leading-relaxed text-ink">{value}</dd>
    </div>
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

export function JobPlaceMeta({
  location,
  deadline,
}: {
  location: string;
  deadline?: string | null;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-1.5 gap-y-1 text-sm">
      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-muted">{location}</p>
        {deadline ? <p className="mt-1 text-subtle">Apply by {formatWhen(deadline)}</p> : null}
      </div>
    </div>
  );
}

function BackToOpenings() {
  return (
    <Link
      to="/career"
      className="inline-flex min-h-11 items-center text-sm font-medium text-ink/70 transition-colors hover:text-ink"
    >
      ← Back to all openings
    </Link>
  );
}

export function JobArticle({
  job,
  showApply,
  showBack,
}: {
  job: CareerJob;
  showApply?: boolean;
  showBack?: boolean;
}) {
  const open = isJobOpen(job);
  const canApply = job.status === "draft" ? Boolean(applyMailto(job)) : open;
  const mailto = showApply && canApply ? applyMailto(job) : null;
  const applyLabel = job.applicationEmail
    ? `Apply via email to ${job.applicationEmail}`
    : "Apply via Email";

  return (
    <article className="min-w-0 space-y-8">
      <header className="min-w-0 space-y-4">
        <JobMeta job={job} />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">
            {job.title}
          </h1>
          <div className="mt-3">
            <JobPlaceMeta location={job.location} deadline={job.applicationDeadline} />
          </div>
        </div>
        {showApply ? (
          mailto ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
              <Button asChild className="w-full sm:w-auto">
                <a href={mailto} aria-label={applyLabel}>
                  Apply via Email
                </a>
              </Button>
              {showBack ? <BackToOpenings /> : null}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-muted shadow-[var(--shadow-card)]">
                This role is no longer accepting applications.
              </p>
              {showBack ? <BackToOpenings /> : null}
            </div>
          )
        ) : showBack ? (
          <BackToOpenings />
        ) : null}
      </header>

      {job.description ? (
        <Section title="Job description">
          <p className="whitespace-pre-wrap text-pretty">{job.description}</p>
        </Section>
      ) : null}
      {job.responsibilities?.length ? (
        <Section title="Responsibilities">
          <Lines items={job.responsibilities} />
        </Section>
      ) : null}
      {job.requirements?.length ? (
        <Section title="Requirements">
          <Lines items={job.requirements} />
        </Section>
      ) : null}
      {job.skills?.length ? (
        <Section title="Required skills">
          <Lines items={job.skills} />
        </Section>
      ) : null}

      {job.education || job.experience || job.compensation || job.workingHours || job.vacancy ? (
        <section className="min-w-0 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:p-7">
          <h2 className="font-display text-xl font-semibold">Role information</h2>
          <dl className="mt-5 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
            {job.vacancy ? <Fact label="Vacancy" value={job.vacancy} /> : null}
            {job.compensation ? <Fact label="Salary / compensation" value={job.compensation} /> : null}
            {job.education ? <Fact label="Education" value={job.education} /> : null}
            {job.experience ? <Fact label="Experience" value={job.experience} /> : null}
            {job.workingHours ? <Fact label="Working hours" value={job.workingHours} /> : null}
          </dl>
        </section>
      ) : null}

      {job.benefits?.length ? (
        <Section title="Benefits">
          <Lines items={job.benefits} />
        </Section>
      ) : null}

      {showBack ? (
        <p className="border-t border-line pt-6">
          <BackToOpenings />
        </p>
      ) : null}
    </article>
  );
}
