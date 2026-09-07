import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";

export const WRITE_STATUSES = new Set(["draft", "published", "closed"]);
export const PUBLIC_STATUSES = new Set(["published", "closed"]);
export const EMPLOYMENT_TYPES = new Set(["Full-time", "Part-time", "Contract", "Internship"]);

export type JobRow = {
  slug: string;
  title: string;
  department: string;
  location: string;
  employment_type: string;
  vacancy: number | null;
  compensation: string;
  education: string;
  experience: string;
  skills: unknown;
  description: string;
  responsibilities: unknown;
  requirements: unknown;
  benefits: unknown;
  working_hours: string;
  application_email: string;
  application_deadline: string | Date | null;
  status: string;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type JobInput = {
  slug?: string;
  title?: string;
  department?: string;
  location?: string;
  employmentType?: string;
  employment_type?: string;
  vacancy?: number | string | null;
  compensation?: string;
  education?: string;
  experience?: string;
  skills?: unknown;
  description?: string;
  responsibilities?: unknown;
  requirements?: unknown;
  benefits?: unknown;
  workingHours?: string;
  working_hours?: string;
  applicationEmail?: string;
  application_email?: string;
  applicationDeadline?: string | null;
  application_deadline?: string | null;
  status?: string;
  displayOrder?: number;
  display_order?: number;
};

function cleanText(value: unknown, label: string, max: number, required = false): string {
  if (value == null) {
    if (required) throw badRequest(`${label} is required`);
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${label} is required`);
  const text = value.trim().slice(0, max);
  if (required && !text) throw badRequest(`${label} is required`);
  return text;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "role";
}

function parseStringList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (value == null || value === "") return [];
  let list: unknown[] = [];
  if (typeof value === "string") {
    list = value
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(value)) {
    list = value;
  } else {
    throw badRequest("Invalid list");
  }
  return list
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLen));
}

function parseDeadline(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest("Application deadline must be a valid date");
  const t = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(t)) throw badRequest("Application deadline must be a valid date");
  return text;
}

function parseVacancy(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > 999) {
    throw badRequest("Vacancy must be a positive whole number");
  }
  return n;
}

function parseEmail(value: unknown, required: boolean): string {
  const email = cleanText(value, "Application email", 180, required).toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("Enter a valid application email");
  return email;
}

function normalize(row: JobRow): JobRow {
  const deadline =
    row.application_deadline instanceof Date
      ? row.application_deadline.toISOString().slice(0, 10)
      : row.application_deadline
        ? String(row.application_deadline).slice(0, 10)
        : null;
  return {
    ...row,
    skills: Array.isArray(row.skills) ? row.skills : [],
    responsibilities: Array.isArray(row.responsibilities) ? row.responsibilities : [],
    requirements: Array.isArray(row.requirements) ? row.requirements : [],
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    application_deadline: deadline,
  };
}

function parsedInput(body: JobInput) {
  const title = cleanText(body.title, "Job title", 160, true);
  const department = cleanText(body.department, "Department", 80, true);
  const location = cleanText(body.location, "Location", 120, true);
  const employmentType = cleanText(body.employmentType ?? body.employment_type, "Employment type", 40, true);
  if (!EMPLOYMENT_TYPES.has(employmentType)) throw badRequest("Employment type must be Full-time, Part-time, Contract, or Internship");
  const compensation = cleanText(body.compensation ?? "", "Compensation", 160);
  const education = cleanText(body.education ?? "", "Education", 160);
  const experience = cleanText(body.experience ?? "", "Experience", 160);
  const description = cleanText(body.description ?? "", "Job description", 8000);
  const workingHours = cleanText(body.workingHours ?? body.working_hours ?? "", "Working hours", 160);
  const applicationEmail = parseEmail(body.applicationEmail ?? body.application_email ?? "", false);
  const applicationDeadline = parseDeadline(body.applicationDeadline ?? body.application_deadline);
  const vacancy = parseVacancy(body.vacancy);
  let status = cleanText(body.status ?? "draft", "Status", 32) || "draft";
  if (!WRITE_STATUSES.has(status)) throw badRequest("Status must be draft, published, or closed");
  const displayOrder = Number(body.displayOrder ?? body.display_order ?? 0);
  if (!Number.isFinite(displayOrder) || !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
    throw badRequest("Display order must be a whole number");
  }
  return {
    title,
    department,
    location,
    employmentType,
    compensation,
    education,
    experience,
    description,
    workingHours,
    applicationEmail,
    applicationDeadline,
    vacancy,
    status,
    displayOrder,
    skills: parseStringList(body.skills, 24, 80),
    responsibilities: parseStringList(body.responsibilities, 24, 240),
    requirements: parseStringList(body.requirements, 24, 240),
    benefits: parseStringList(body.benefits, 16, 240),
  };
}

function assertPublishable(parsed: ReturnType<typeof parsedInput>) {
  if (!parsed.description) throw badRequest("Published jobs need a job description");
  if (!parsed.applicationEmail) throw badRequest("Published jobs need an application email");
}

async function uniqueSlug(client: PoolClient, base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`.slice(0, 88);
    const { rows } = await client.query(`select 1 from jobs where slug = $1`, [candidate]);
    if (!rows[0]) return candidate;
  }
  return `${slug}-${uid("s").slice(-6)}`;
}

async function uniqueOrConflict(client: PoolClient, slug: string): Promise<string> {
  const { rows } = await client.query(`select 1 from jobs where slug = $1`, [slug]);
  if (rows[0]) throw conflict("A job with this slug already exists");
  return slug;
}

export async function listPublicJobs(client: PoolClient): Promise<JobRow[]> {
  const { rows } = await client.query<JobRow>(
    `select * from jobs
      where status = 'published'
        and (application_deadline is null or application_deadline >= current_date)
      order by display_order asc, created_at desc`,
  );
  return rows.map(normalize);
}

export async function listAdminJobs(client: PoolClient): Promise<JobRow[]> {
  const { rows } = await client.query<JobRow>(
    `select * from jobs order by display_order asc, updated_at desc`,
  );
  return rows.map(normalize);
}

export async function getJobRow(client: PoolClient, slug: string, opts: { includeDraft?: boolean } = {}): Promise<JobRow> {
  const { rows } = await client.query<JobRow>(`select * from jobs where slug = $1`, [slug]);
  const job = rows[0];
  if (!job) throw notFound("Job not found");
  if (!opts.includeDraft && !PUBLIC_STATUSES.has(job.status)) throw notFound("Job not found");
  return normalize(job);
}

export async function createJob(client: PoolClient, body: JobInput): Promise<JobRow> {
  const parsed = parsedInput(body);
  const requested = cleanText(body.slug ?? "", "Slug", 88);
  if (requested && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requested)) {
    throw badRequest("Slug may only contain lowercase letters, numbers, and hyphens");
  }
  const slug = requested ? await uniqueOrConflict(client, requested) : await uniqueSlug(client, parsed.title);
  if (parsed.status === "published") assertPublishable(parsed);
  const { rows } = await client.query<JobRow>(
    `insert into jobs (
       slug, title, department, location, employment_type, vacancy, compensation, education, experience,
       skills, description, responsibilities, requirements, benefits, working_hours,
       application_email, application_deadline, status, display_order
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16,$17,$18,$19
     ) returning *`,
    [
      slug,
      parsed.title,
      parsed.department,
      parsed.location,
      parsed.employmentType,
      parsed.vacancy,
      parsed.compensation,
      parsed.education,
      parsed.experience,
      JSON.stringify(parsed.skills),
      parsed.description,
      JSON.stringify(parsed.responsibilities),
      JSON.stringify(parsed.requirements),
      JSON.stringify(parsed.benefits),
      parsed.workingHours,
      parsed.applicationEmail,
      parsed.applicationDeadline,
      parsed.status,
      parsed.displayOrder,
    ],
  );
  return normalize(rows[0]!);
}

export async function updateJob(client: PoolClient, slug: string, body: JobInput): Promise<JobRow> {
  const existing = await getJobRow(client, slug, { includeDraft: true });
  const parsed = parsedInput({
    title: body.title ?? existing.title,
    department: body.department ?? existing.department,
    location: body.location ?? existing.location,
    employmentType: body.employmentType ?? body.employment_type ?? existing.employment_type,
    vacancy: body.vacancy !== undefined ? body.vacancy : existing.vacancy,
    compensation: body.compensation ?? existing.compensation,
    education: body.education ?? existing.education,
    experience: body.experience ?? existing.experience,
    skills: body.skills ?? existing.skills,
    description: body.description ?? existing.description,
    responsibilities: body.responsibilities ?? existing.responsibilities,
    requirements: body.requirements ?? existing.requirements,
    benefits: body.benefits ?? existing.benefits,
    workingHours: body.workingHours ?? body.working_hours ?? existing.working_hours,
    applicationEmail: body.applicationEmail ?? body.application_email ?? existing.application_email,
    applicationDeadline:
      body.applicationDeadline !== undefined || body.application_deadline !== undefined
        ? (body.applicationDeadline ?? body.application_deadline)
        : (existing.application_deadline as string | null),
    status: body.status ?? existing.status,
    displayOrder: body.displayOrder ?? body.display_order ?? existing.display_order,
  });
  if (parsed.status === "published") assertPublishable(parsed);
  const { rows } = await client.query<JobRow>(
    `update jobs set
       title = $2, department = $3, location = $4, employment_type = $5, vacancy = $6,
       compensation = $7, education = $8, experience = $9, skills = $10::jsonb,
       description = $11, responsibilities = $12::jsonb, requirements = $13::jsonb,
       benefits = $14::jsonb, working_hours = $15, application_email = $16,
       application_deadline = $17, status = $18, display_order = $19, updated_at = now()
     where slug = $1
     returning *`,
    [
      slug,
      parsed.title,
      parsed.department,
      parsed.location,
      parsed.employmentType,
      parsed.vacancy,
      parsed.compensation,
      parsed.education,
      parsed.experience,
      JSON.stringify(parsed.skills),
      parsed.description,
      JSON.stringify(parsed.responsibilities),
      JSON.stringify(parsed.requirements),
      JSON.stringify(parsed.benefits),
      parsed.workingHours,
      parsed.applicationEmail,
      parsed.applicationDeadline,
      parsed.status,
      parsed.displayOrder,
    ],
  );
  return normalize(rows[0]!);
}

export async function setJobStatus(client: PoolClient, slug: string, statusRaw: string): Promise<JobRow> {
  let status = cleanText(statusRaw, "Status", 32, true);
  if (status === "unpublish") status = "draft";
  if (!WRITE_STATUSES.has(status)) throw badRequest("Status must be draft, published, or closed");
  const existing = await getJobRow(client, slug, { includeDraft: true });
  if (status === "published") {
    if (!existing.description) throw badRequest("Published jobs need a job description");
    if (!existing.application_email) throw badRequest("Published jobs need an application email");
  }
  const { rows } = await client.query<JobRow>(
    `update jobs set status = $2, updated_at = now() where slug = $1 returning *`,
    [slug, status],
  );
  return normalize(rows[0]!);
}
