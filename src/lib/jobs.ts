export type JobStatus = "draft" | "published" | "closed";

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship"] as const;
export const DEPARTMENTS = [
  "Operations",
  "Property",
  "Member Experience",
  "Finance",
  "Technology",
  "People",
  "Communications",
] as const;

export type CareerJob = {
  slug: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  vacancy?: number | null;
  compensation?: string;
  education?: string;
  experience?: string;
  skills?: string[];
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  workingHours?: string;
  applicationEmail?: string;
  applicationDeadline?: string | null;
  status: JobStatus;
  displayOrder?: number;
  updatedAt?: string;
};

export type ApiJob = {
  slug: string;
  title: string;
  department: string;
  location: string;
  employment_type: string;
  vacancy: number | null;
  compensation?: string | null;
  education?: string | null;
  experience?: string | null;
  skills?: string[] | null;
  description?: string | null;
  responsibilities?: string[] | null;
  requirements?: string[] | null;
  benefits?: string[] | null;
  working_hours?: string | null;
  application_email?: string | null;
  application_deadline?: string | null;
  status: JobStatus;
  display_order?: number | null;
  updated_at?: string | null;
};

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function fromApiJob(row: ApiJob): CareerJob {
  const deadline = row.application_deadline ? String(row.application_deadline).slice(0, 10) : null;
  return {
    slug: row.slug,
    title: row.title,
    department: row.department,
    location: row.location,
    employmentType: row.employment_type,
    vacancy: row.vacancy,
    compensation: row.compensation ?? undefined,
    education: row.education ?? undefined,
    experience: row.experience ?? undefined,
    skills: list(row.skills),
    description: row.description ?? undefined,
    responsibilities: list(row.responsibilities),
    requirements: list(row.requirements),
    benefits: list(row.benefits),
    workingHours: row.working_hours ?? undefined,
    applicationEmail: row.application_email ?? undefined,
    applicationDeadline: deadline,
    status: row.status,
    displayOrder: row.display_order ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export function isJobOpen(job: Pick<CareerJob, "status" | "applicationDeadline">, now = new Date()): boolean {
  if (job.status !== "published") return false;
  if (!job.applicationDeadline) return true;
  return job.applicationDeadline >= now.toISOString().slice(0, 10);
}

export function applyMailto(job: Pick<CareerJob, "title" | "applicationEmail">): string | null {
  const email = (job.applicationEmail ?? "").trim();
  if (!email || email.includes("\n") || email.includes(" ")) return null;
  const subject = encodeURIComponent(`Application for ${job.title} — Darmelk`);
  return `mailto:${email}?subject=${subject}`;
}
