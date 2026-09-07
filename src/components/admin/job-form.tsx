import type { ReactNode } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS, EMPLOYMENT_TYPES, type CareerJob } from "@/lib/jobs";

export type JobFormValue = {
  title: string;
  slug: string;
  department: string;
  location: string;
  employmentType: string;
  vacancy: string;
  compensation: string;
  education: string;
  experience: string;
  skillsText: string;
  description: string;
  responsibilitiesText: string;
  requirementsText: string;
  benefitsText: string;
  workingHours: string;
  applicationEmail: string;
  applicationDeadline: string;
  displayOrder: string;
};

export function emptyJobForm(): JobFormValue {
  return {
    title: "",
    slug: "",
    department: DEPARTMENTS[0],
    location: "",
    employmentType: EMPLOYMENT_TYPES[0],
    vacancy: "",
    compensation: "",
    education: "",
    experience: "",
    skillsText: "",
    description: "",
    responsibilitiesText: "",
    requirementsText: "",
    benefitsText: "",
    workingHours: "",
    applicationEmail: "",
    applicationDeadline: "",
    displayOrder: "0",
  };
}

export function formFromJob(job: CareerJob): JobFormValue {
  return {
    title: job.title,
    slug: job.slug,
    department: job.department,
    location: job.location,
    employmentType: job.employmentType,
    vacancy: job.vacancy ? String(job.vacancy) : "",
    compensation: job.compensation ?? "",
    education: job.education ?? "",
    experience: job.experience ?? "",
    skillsText: (job.skills ?? []).join("\n"),
    description: job.description ?? "",
    responsibilitiesText: (job.responsibilities ?? []).join("\n"),
    requirementsText: (job.requirements ?? []).join("\n"),
    benefitsText: (job.benefits ?? []).join("\n"),
    workingHours: job.workingHours ?? "",
    applicationEmail: job.applicationEmail ?? "",
    applicationDeadline: job.applicationDeadline ?? "",
    displayOrder: String(job.displayOrder ?? 0),
  };
}

function lines(text: string) {
  return text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function payloadFromJobForm(form: JobFormValue, opts?: { includeSlug?: boolean }) {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    department: form.department,
    location: form.location.trim(),
    employmentType: form.employmentType,
    vacancy: form.vacancy.trim() ? Number(form.vacancy) : null,
    compensation: form.compensation.trim(),
    education: form.education.trim(),
    experience: form.experience.trim(),
    skills: lines(form.skillsText),
    description: form.description.trim(),
    responsibilities: lines(form.responsibilitiesText),
    requirements: lines(form.requirementsText),
    benefits: lines(form.benefitsText),
    workingHours: form.workingHours.trim(),
    applicationEmail: form.applicationEmail.trim(),
    applicationDeadline: form.applicationDeadline.trim() || null,
    displayOrder: Number(form.displayOrder || 0),
  };
  if (opts?.includeSlug && form.slug.trim()) payload.slug = form.slug.trim();
  return payload;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-5 grid min-w-0 gap-4">{children}</div>
    </section>
  );
}

export function JobForm({
  value,
  onChange,
  onSubmit,
  pending,
  error,
  slugLocked,
  submitLabel,
}: {
  value: JobFormValue;
  onChange: (next: JobFormValue) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  slugLocked?: boolean;
  submitLabel: string;
}) {
  const set = (patch: Partial<JobFormValue>) => onChange({ ...value, ...patch });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {error ? <p className="text-sm text-clay">{error}</p> : null}

      <Section title="Basic information">
        <Field label="Job title" htmlFor="job-title">
          <Input id="job-title" value={value.title} onChange={(e) => set({ title: e.target.value })} required />
        </Field>
        <Field label="Slug" hint={slugLocked ? "Slug cannot change after create." : "Leave blank to generate from the title."} htmlFor="job-slug">
          <Input
            id="job-slug"
            value={value.slug}
            onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
            disabled={slugLocked}
            placeholder="member-operations-associate"
          />
        </Field>
        <Field label="Department" htmlFor="job-department">
          <select
            id="job-department"
            className="field-control"
            value={value.department}
            onChange={(e) => set({ department: e.target.value })}
            required
          >
            {Array.from(new Set([...DEPARTMENTS, value.department].filter(Boolean))).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Role details">
        <Field label="Location" htmlFor="job-location">
          <Input id="job-location" value={value.location} onChange={(e) => set({ location: e.target.value })} required />
        </Field>
        <Field label="Employment type" htmlFor="job-type">
          <select
            id="job-type"
            className="field-control"
            value={value.employmentType}
            onChange={(e) => set({ employmentType: e.target.value })}
            required
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vacancy" hint="Optional. Number of openings." htmlFor="job-vacancy">
          <Input id="job-vacancy" inputMode="numeric" value={value.vacancy} onChange={(e) => set({ vacancy: e.target.value })} />
        </Field>
        <Field label="Working hours" htmlFor="job-hours">
          <Input id="job-hours" value={value.workingHours} onChange={(e) => set({ workingHours: e.target.value })} />
        </Field>
        <Field label="Job description" htmlFor="job-description">
          <textarea
            id="job-description"
            className="field-control min-h-32 py-2"
            value={value.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <Field label="Responsibilities" hint="One item per line." htmlFor="job-responsibilities">
          <textarea
            id="job-responsibilities"
            className="field-control min-h-24 py-2"
            value={value.responsibilitiesText}
            onChange={(e) => set({ responsibilitiesText: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Requirements">
        <Field label="Education" htmlFor="job-education">
          <Input id="job-education" value={value.education} onChange={(e) => set({ education: e.target.value })} />
        </Field>
        <Field label="Experience" htmlFor="job-experience">
          <Input id="job-experience" value={value.experience} onChange={(e) => set({ experience: e.target.value })} />
        </Field>
        <Field label="Required skills" hint="One skill per line." htmlFor="job-skills">
          <textarea
            id="job-skills"
            className="field-control min-h-24 py-2"
            value={value.skillsText}
            onChange={(e) => set({ skillsText: e.target.value })}
          />
        </Field>
        <Field label="Requirements" hint="One item per line." htmlFor="job-requirements">
          <textarea
            id="job-requirements"
            className="field-control min-h-24 py-2"
            value={value.requirementsText}
            onChange={(e) => set({ requirementsText: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Compensation and benefits">
        <Field label="Salary / compensation" htmlFor="job-compensation">
          <Input id="job-compensation" value={value.compensation} onChange={(e) => set({ compensation: e.target.value })} />
        </Field>
        <Field label="Benefits" hint="One item per line." htmlFor="job-benefits">
          <textarea
            id="job-benefits"
            className="field-control min-h-24 py-2"
            value={value.benefitsText}
            onChange={(e) => set({ benefitsText: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Application information">
        <Field label="Application email" htmlFor="job-email">
          <Input
            id="job-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={value.applicationEmail}
            onChange={(e) => set({ applicationEmail: e.target.value })}
            className="min-w-0"
          />
        </Field>
        <Field label="Application deadline" hint="Optional." htmlFor="job-deadline">
          <Input id="job-deadline" type="date" value={value.applicationDeadline} onChange={(e) => set({ applicationDeadline: e.target.value })} />
        </Field>
      </Section>

      <Section title="Publishing">
        <Field label="Display order" hint="Lower numbers appear first." htmlFor="job-order">
          <Input id="job-order" inputMode="numeric" value={value.displayOrder} onChange={(e) => set({ displayOrder: e.target.value })} />
        </Field>
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
