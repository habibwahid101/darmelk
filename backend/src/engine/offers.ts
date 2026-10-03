import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { assertTotalQuantityAllowed, deriveInventory, soldByOffer, type Inventory } from "./inventory.js";

export const PUBLIC_STATUSES = new Set(["published", "available"]);
export const VISIBLE_STATUSES = new Set(["published", "available", "closed"]);
export const ALL_STATUSES = new Set(["draft", "published", "closed", "available", "coming-soon"]);
export const WRITE_STATUSES = new Set(["draft", "published", "closed"]);
export const INSTALLMENT_FREQUENCIES = new Set(["monthly", "quarterly", "yearly"]);

const CATEGORY_MAP: Record<string, string> = {
  "hotel-resort-shares": "Hotel & Resort Shares",
  "land-plots": "Land & Plots",
  apartments: "Flats & Apartments",
  investment: "Commercial Properties",
  "commercial-properties": "Commercial Properties",
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 1_500_000;
const UNSUPPORTED_IMAGE = "Unsupported image format. Please upload JPG, PNG or WebP.";

export type OfferRow = {
  slug: string;
  title: string;
  category: string;
  category_slug: string;
  location: string | null;
  image: string | null;
  hero_image: string | null;
  image_alt: string;
  hero_image_alt: string;
  retail_value: number;
  booking_amount: number;
  qualification_benefit: number;
  commission_eligible_amount: number;
  full_payment_price: number | null;
  full_payment_deadline_days: number | null;
  payment_completion_deadline: string | null;
  installment_enabled: boolean;
  installment_count: number | null;
  installment_frequency: string | null;
  installment_amount: number | null;
  installment_duration_months: number | null;
  first_installment_due_rule: string | null;
  grace_period_days: number | null;
  total_quantity: number | null;
  inventory?: Inventory;
  status: string;
  flagship: boolean;
  summary: string;
  details: string;
  features: unknown;
  notes: string;
  display_order: number;
  gallery: unknown;
  version: number;
  created_at: string;
  updated_at: string;
};

export type OfferInput = {
  slug?: string;
  title?: string;
  categorySlug?: string;
  category_slug?: string;
  category?: string;
  location?: string | null;
  image?: string | null;
  heroImage?: string | null;
  hero_image?: string | null;
  imageAlt?: string;
  image_alt?: string;
  heroImageAlt?: string;
  hero_image_alt?: string;
  retailValue?: number;
  retail_value?: number;
  bookingAmount?: number;
  booking_amount?: number;
  qualificationBenefit?: number;
  qualification_benefit?: number;
  commissionEligibleAmount?: number;
  commission_eligible_amount?: number;
  fullPaymentPrice?: number | null;
  full_payment_price?: number | null;
  fullPaymentDeadlineDays?: number | null;
  full_payment_deadline_days?: number | null;
  paymentCompletionDeadline?: string | null;
  payment_completion_deadline?: string | null;
  installmentEnabled?: boolean;
  installment_enabled?: boolean;
  installmentCount?: number | null;
  installment_count?: number | null;
  installmentFrequency?: string | null;
  installment_frequency?: string | null;
  installmentAmount?: number | null;
  installment_amount?: number | null;
  installmentDurationMonths?: number | null;
  installment_duration_months?: number | null;
  firstInstallmentDueRule?: string | null;
  first_installment_due_rule?: string | null;
  gracePeriodDays?: number | null;
  grace_period_days?: number | null;
  totalQuantity?: number | null;
  total_quantity?: number | null;
  status?: string;
  flagship?: boolean;
  summary?: string;
  details?: string;
  features?: unknown;
  notes?: string;
  displayOrder?: number;
  display_order?: number;
  gallery?: unknown;
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

function money(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw badRequest(`${label} must be a positive whole amount`);
  }
  return n;
}

function optionalMoney(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  return money(value, label);
}

function optionalPositiveInt(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw badRequest(`${label} must be a positive whole number`);
  }
  return n;
}

function optionalCalendarDate(value: unknown, label: string): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw badRequest(`${label} must be a calendar date`);
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") throw badRequest(`${label} must be a calendar date`);
  const text = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest(`${label} must be a calendar date`);
  const [year, month, day] = text.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month! - 1 || utc.getUTCDate() !== day) {
    throw badRequest(`${label} must be a calendar date`);
  }
  return text;
}

export function calendarDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

function optionalNonNegInt(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw badRequest(`${label} must be zero or a positive whole number`);
  }
  return n;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "offer";
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

function mediaPath(slug: string, id: string): string {
  return `/api/offers/${slug}/media/${id}`;
}

type MediaRef = { id: string; filename: string };

function sniffImage(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function canonicalMediaRef(slug: string, value: unknown, media: MediaRef[]): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.startsWith("blob:") || text.startsWith("data:")) return null;
  const found = text.match(/\/api\/offers\/([^/]+)\/media\/([^/?#]+)/);
  if (found) return `/api/offers/${found[1]}/media/${found[2]}`;
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/images/") || text.startsWith("/brand/")) return text;
  if (text.startsWith("images/")) return `/${text}`;
  if (text.startsWith("/")) return text;
  const match = media.find((item) => item.filename === text);
  if (match) return mediaPath(slug, match.id);
  return text;
}

function canonicalizeOffer(row: OfferRow, media: MediaRef[]): OfferRow {
  const gallery = Array.isArray(row.gallery) ? row.gallery : [];
  return {
    ...row,
    image: canonicalMediaRef(row.slug, row.image, media),
    hero_image: canonicalMediaRef(row.slug, row.hero_image, media),
    gallery: gallery
      .map((item) => canonicalMediaRef(row.slug, item, media))
      .filter((item): item is string => Boolean(item)),
  };
}

async function mediaForOffers(client: PoolClient, slugs: string[]): Promise<Map<string, MediaRef[]>> {
  const grouped = new Map<string, MediaRef[]>();
  if (!slugs.length) return grouped;
  const { rows } = await client.query<MediaRef & { offer_slug: string }>(
    `select id, offer_slug, filename from offer_media where offer_slug = any($1::text[]) order by sort_order asc, created_at asc`,
    [slugs],
  );
  for (const row of rows) {
    const list = grouped.get(row.offer_slug) ?? [];
    list.push({ id: row.id, filename: row.filename });
    grouped.set(row.offer_slug, list);
  }
  return grouped;
}

function referenceDropped(value: string, path: string, filename: string): boolean {
  if (value === path) return true;
  if (filename && value === filename) return true;
  return path.length > 0 && value.endsWith(path);
}

export function isBookableStatus(status: string): boolean {
  return PUBLIC_STATUSES.has(status);
}

async function uniqueSlug(client: PoolClient, base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`.slice(0, 88);
    const { rows } = await client.query(`select 1 from offers where slug = $1`, [candidate]);
    if (!rows[0]) return candidate;
  }
  return `${slug}-${uid("s").slice(-6)}`;
}

async function unsetOtherFlagships(client: PoolClient, slug: string) {
  await client.query(`update offers set flagship = false, updated_at = now() where slug <> $1 and flagship = true`, [slug]);
}

function normalize(row: OfferRow): OfferRow {
  return {
    ...row,
    features: Array.isArray(row.features) ? row.features : [],
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    installment_enabled: Boolean(row.installment_enabled),
    full_payment_price: row.full_payment_price ?? null,
    full_payment_deadline_days: row.full_payment_deadline_days ?? null,
    payment_completion_deadline: calendarDate(row.payment_completion_deadline),
    installment_count: row.installment_count ?? null,
    installment_frequency: row.installment_frequency ?? null,
    installment_amount: row.installment_amount ?? null,
    installment_duration_months: row.installment_duration_months ?? null,
    first_installment_due_rule: row.first_installment_due_rule ?? null,
    grace_period_days: row.grace_period_days ?? null,
    total_quantity: row.total_quantity ?? null,
  };
}

async function withInventory(client: PoolClient, rows: OfferRow[]): Promise<OfferRow[]> {
  const counts = await soldByOffer(
    client,
    rows.map((row) => row.slug),
  );
  const media = await mediaForOffers(client, rows.map((row) => row.slug));
  return rows.map((row) => {
    const canonical = canonicalizeOffer(normalize(row), media.get(row.slug) ?? []);
    return {
      ...canonical,
      inventory: deriveInventory(row.total_quantity, counts.get(row.slug) ?? 0),
    };
  });
}

export async function listPublicOffers(client: PoolClient): Promise<OfferRow[]> {
  const { rows } = await client.query<OfferRow>(
    `select * from offers
      where status in ('published', 'available')
      order by flagship desc, display_order asc, created_at asc`,
  );
  return withInventory(client, rows);
}

export async function listAdminOffers(client: PoolClient): Promise<OfferRow[]> {
  const { rows } = await client.query<OfferRow>(
    `select * from offers order by flagship desc, display_order asc, updated_at desc`,
  );
  return withInventory(client, rows);
}

export async function getOfferRow(client: PoolClient, slug: string, opts: { includeDraft?: boolean } = {}): Promise<OfferRow> {
  const { rows } = await client.query<OfferRow>(`select * from offers where slug = $1`, [slug]);
  const offer = rows[0];
  if (!offer) throw notFound("Offer not found");
  if (!opts.includeDraft && !VISIBLE_STATUSES.has(offer.status) && offer.status !== "coming-soon") {
    throw notFound("Offer not found");
  }
  return (await withInventory(client, [offer]))[0]!;
}

function parsedInput(body: OfferInput) {
  const title = cleanText(body.title, "Title", 160, true);
  const categorySlugRaw = cleanText(body.categorySlug ?? body.category_slug, "Category", 80, true);
  const categorySlug = categorySlugRaw === "commercial-properties" ? "investment" : categorySlugRaw;
  const category = CATEGORY_MAP[categorySlug] ?? cleanText(body.category, "Category", 120, true);
  if (!CATEGORY_MAP[categorySlug] && !body.category) throw badRequest("Category is required");
  const location = cleanText(body.location ?? "", "Location", 120) || null;
  const summary = cleanText(body.summary ?? "", "Short description", 600);
  const details = cleanText(body.details ?? "", "Details", 8000);
  const notes = cleanText(body.notes ?? "", "Notes", 2000);
  const image = cleanText(body.image ?? "", "Main image", 400) || null;
  const heroImage = cleanText(body.heroImage ?? body.hero_image ?? "", "Hero image", 400) || null;
  const imageAlt = cleanText(body.imageAlt ?? body.image_alt ?? "", "Image alt", 160);
  const heroImageAlt = cleanText(body.heroImageAlt ?? body.hero_image_alt ?? "", "Hero alt", 160);
  const retailValue = money(body.retailValue ?? body.retail_value, "Retail value");
  const bookingAmount = money(body.bookingAmount ?? body.booking_amount, "Booking amount");
  const qualificationBenefit = money(body.qualificationBenefit ?? body.qualification_benefit, "Qualification benefit");
  const commissionEligible = money(
    body.commissionEligibleAmount ?? body.commission_eligible_amount ?? bookingAmount,
    "Commission-eligible amount",
  );
  const fullPaymentPrice = optionalMoney(body.fullPaymentPrice ?? body.full_payment_price, "Full payment price");
  const fullPaymentDeadlineDays = optionalPositiveInt(
    body.fullPaymentDeadlineDays ?? body.full_payment_deadline_days,
    "Full payment deadline",
  );
  const paymentCompletionDeadline = optionalCalendarDate(
    body.paymentCompletionDeadline ?? body.payment_completion_deadline,
    "Payment Completion Deadline",
  );
  const installmentEnabled = Boolean(body.installmentEnabled ?? body.installment_enabled);
  let installmentCount = optionalPositiveInt(body.installmentCount ?? body.installment_count, "Installment count");
  let installmentFrequency = cleanText(body.installmentFrequency ?? body.installment_frequency ?? "", "Installment frequency", 20) || null;
  let installmentAmount = optionalMoney(body.installmentAmount ?? body.installment_amount, "Installment amount");
  let installmentDurationMonths = optionalPositiveInt(
    body.installmentDurationMonths ?? body.installment_duration_months,
    "Installment duration",
  );
  let firstInstallmentDueRule =
    cleanText(body.firstInstallmentDueRule ?? body.first_installment_due_rule ?? "", "First installment due", 160) || null;
  let gracePeriodDays = optionalNonNegInt(body.gracePeriodDays ?? body.grace_period_days, "Grace period");
  const totalQuantity = optionalNonNegInt(body.totalQuantity ?? body.total_quantity, "Total quantity");

  if (installmentEnabled) {
    if (!installmentCount) throw badRequest("Installment count is required when installments are available", "installment_count_required");
    if (!installmentFrequency) throw badRequest("Installment frequency is required when installments are available", "installment_frequency_required");
    if (!INSTALLMENT_FREQUENCIES.has(installmentFrequency)) {
      throw badRequest("Installment frequency must be monthly, quarterly, or yearly", "installment_frequency_invalid");
    }
    if (!installmentAmount && fullPaymentPrice) {
      installmentAmount = Math.floor(fullPaymentPrice / installmentCount);
      if (installmentAmount <= 0) throw badRequest("Installment amount must be a positive whole amount");
    }
    if (!installmentAmount) throw badRequest("Installment amount is required when installments are available", "installment_amount_required");
  } else {
    installmentCount = null;
    installmentFrequency = null;
    installmentAmount = null;
    installmentDurationMonths = null;
    firstInstallmentDueRule = null;
    gracePeriodDays = null;
  }

  let status = cleanText(body.status ?? "draft", "Status", 32) || "draft";
  if (status === "available") status = "published";
  if (status === "coming-soon") status = "draft";
  if (!WRITE_STATUSES.has(status)) throw badRequest("Status must be draft, published, or closed");
  const displayOrder = Number(body.displayOrder ?? body.display_order ?? 0);
  if (!Number.isFinite(displayOrder) || !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
    throw badRequest("Display order must be a whole number");
  }
  const features = parseStringList(body.features, 24, 160);
  const gallery = parseStringList(body.gallery, 12, 400);
  const flagship = Boolean(body.flagship);
  return {
    title,
    categorySlug,
    category,
    location,
    summary,
    details,
    notes,
    image,
    heroImage,
    imageAlt,
    heroImageAlt,
    retailValue,
    bookingAmount,
    qualificationBenefit,
    commissionEligible,
    fullPaymentPrice,
    fullPaymentDeadlineDays,
    paymentCompletionDeadline,
    installmentEnabled,
    installmentCount,
    installmentFrequency,
    installmentAmount,
    installmentDurationMonths,
    firstInstallmentDueRule,
    gracePeriodDays,
    totalQuantity,
    status,
    displayOrder,
    features,
    gallery,
    flagship,
  };
}

function assertPublishable(parsed: ReturnType<typeof parsedInput>) {
  if (!parsed.summary) throw badRequest("Published offers need a short description");
  if (!parsed.image) throw badRequest("Published offers need a main image");
}

const OFFER_WRITE_COLS = `
       slug, title, category, category_slug, location, image, hero_image, image_alt, hero_image_alt,
       retail_value, booking_amount, qualification_benefit, commission_eligible_amount,
       full_payment_price, full_payment_deadline_days, payment_completion_deadline, installment_enabled, installment_count,
       installment_frequency, installment_amount, installment_duration_months,
       first_installment_due_rule, grace_period_days, total_quantity,
       status, flagship, summary, details, features, notes, display_order, gallery, version
`;

function writeParams(slug: string, parsed: ReturnType<typeof parsedInput>, version: number): unknown[] {
  return [
    slug,
    parsed.title,
    parsed.category,
    parsed.categorySlug,
    parsed.location,
    parsed.image,
    parsed.heroImage,
    parsed.imageAlt,
    parsed.heroImageAlt,
    parsed.retailValue,
    parsed.bookingAmount,
    parsed.qualificationBenefit,
    parsed.commissionEligible,
    parsed.fullPaymentPrice,
    parsed.fullPaymentDeadlineDays,
    parsed.paymentCompletionDeadline,
    parsed.installmentEnabled,
    parsed.installmentCount,
    parsed.installmentFrequency,
    parsed.installmentAmount,
    parsed.installmentDurationMonths,
    parsed.firstInstallmentDueRule,
    parsed.gracePeriodDays,
    parsed.totalQuantity,
    parsed.status,
    parsed.flagship,
    parsed.summary,
    parsed.details,
    JSON.stringify(parsed.features),
    parsed.notes,
    parsed.displayOrder,
    JSON.stringify(parsed.gallery),
    version,
  ];
}

export async function createOffer(client: PoolClient, body: OfferInput): Promise<OfferRow> {
  const parsed = parsedInput(body);
  const requested = cleanText(body.slug ?? "", "Slug", 88);
  if (requested && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requested)) {
    throw badRequest("Slug may only contain lowercase letters, numbers, and hyphens");
  }
  const slug = requested ? await uniqueOrConflict(client, requested) : await uniqueSlug(client, parsed.title);
  if (parsed.status === "published") assertPublishable(parsed);
  if (parsed.flagship) await unsetOtherFlagships(client, slug);
  const { rows } = await client.query<OfferRow>(
    `insert into offers (${OFFER_WRITE_COLS})
     values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb,$30,$31,$32::jsonb,$33
     ) returning *`,
    writeParams(slug, parsed, 1),
  );
  return (await withInventory(client, [rows[0]!]))[0]!;
}

async function uniqueOrConflict(client: PoolClient, slug: string): Promise<string> {
  const { rows } = await client.query(`select 1 from offers where slug = $1`, [slug]);
  if (rows[0]) throw conflict("An offer with this slug already exists");
  return slug;
}

export async function updateOffer(client: PoolClient, slug: string, body: OfferInput): Promise<OfferRow> {
  const existing = await getOfferRow(client, slug, { includeDraft: true });
  const parsed = parsedInput({
    ...existing,
    retailValue: existing.retail_value,
    bookingAmount: existing.booking_amount,
    qualificationBenefit: existing.qualification_benefit,
    commissionEligibleAmount: existing.commission_eligible_amount,
    heroImage: existing.hero_image,
    imageAlt: existing.image_alt,
    heroImageAlt: existing.hero_image_alt,
    displayOrder: existing.display_order,
    fullPaymentPrice: existing.full_payment_price,
    fullPaymentDeadlineDays: existing.full_payment_deadline_days,
    paymentCompletionDeadline: calendarDate(existing.payment_completion_deadline),
    installmentEnabled: existing.installment_enabled,
    installmentCount: existing.installment_count,
    installmentFrequency: existing.installment_frequency,
    installmentAmount: existing.installment_amount,
    installmentDurationMonths: existing.installment_duration_months,
    firstInstallmentDueRule: existing.first_installment_due_rule,
    gracePeriodDays: existing.grace_period_days,
    totalQuantity: existing.total_quantity,
    ...body,
    title: body.title ?? existing.title,
    categorySlug: body.categorySlug ?? body.category_slug ?? existing.category_slug,
    status: body.status ?? existing.status,
  });
  const media = (await mediaForOffers(client, [slug])).get(slug) ?? [];
  parsed.image = canonicalMediaRef(slug, parsed.image, media);
  parsed.heroImage = canonicalMediaRef(slug, parsed.heroImage, media);
  parsed.gallery = parsed.gallery
    .map((item) => canonicalMediaRef(slug, item, media))
    .filter((item): item is string => Boolean(item));
  if (parsed.status === "published") assertPublishable(parsed);
  await assertTotalQuantityAllowed(client, slug, parsed.totalQuantity);
  const economicsChanged =
    parsed.retailValue !== existing.retail_value ||
    parsed.bookingAmount !== existing.booking_amount ||
    parsed.qualificationBenefit !== existing.qualification_benefit ||
    parsed.commissionEligible !== existing.commission_eligible_amount ||
    parsed.fullPaymentPrice !== (existing.full_payment_price ?? null) ||
    parsed.fullPaymentDeadlineDays !== (existing.full_payment_deadline_days ?? null) ||
    parsed.paymentCompletionDeadline !== calendarDate(existing.payment_completion_deadline) ||
    parsed.installmentEnabled !== Boolean(existing.installment_enabled) ||
    parsed.installmentCount !== (existing.installment_count ?? null) ||
    parsed.installmentFrequency !== (existing.installment_frequency ?? null) ||
    parsed.installmentAmount !== (existing.installment_amount ?? null) ||
    parsed.installmentDurationMonths !== (existing.installment_duration_months ?? null) ||
    parsed.firstInstallmentDueRule !== (existing.first_installment_due_rule ?? null) ||
    parsed.gracePeriodDays !== (existing.grace_period_days ?? null);
  const nextVersion = economicsChanged ? existing.version + 1 : existing.version;
  if (parsed.flagship) await unsetOtherFlagships(client, slug);
  const { rows } = await client.query<OfferRow>(
    `update offers set
       title = $2, category = $3, category_slug = $4, location = $5,
       image = $6, hero_image = $7, image_alt = $8, hero_image_alt = $9,
       retail_value = $10, booking_amount = $11, qualification_benefit = $12,
       commission_eligible_amount = $13, full_payment_price = $14, full_payment_deadline_days = $15,
       payment_completion_deadline = $16,
       installment_enabled = $17, installment_count = $18, installment_frequency = $19,
       installment_amount = $20, installment_duration_months = $21, first_installment_due_rule = $22,
       grace_period_days = $23, total_quantity = $24, status = $25, flagship = $26,
       summary = $27, details = $28, features = $29::jsonb, notes = $30,
       display_order = $31, gallery = $32::jsonb, version = $33, updated_at = now()
     where slug = $1
     returning *`,
    writeParams(slug, parsed, nextVersion),
  );
  return (await withInventory(client, [rows[0]!]))[0]!;
}

export async function setOfferStatus(client: PoolClient, slug: string, statusRaw: string): Promise<OfferRow> {
  let status = cleanText(statusRaw, "Status", 32, true);
  if (status === "available") status = "published";
  if (status === "unpublish") status = "draft";
  if (!WRITE_STATUSES.has(status)) throw badRequest("Status must be draft, published, or closed");
  const existing = await getOfferRow(client, slug, { includeDraft: true });
  if (status === "published") {
    if (!existing.summary) throw badRequest("Published offers need a short description");
    if (!existing.image) throw badRequest("Published offers need a main image");
  }
  const { rows } = await client.query<OfferRow>(
    `update offers set status = $2, updated_at = now() where slug = $1 returning *`,
    [slug, status],
  );
  return (await withInventory(client, [rows[0]!]))[0]!;
}

export async function addOfferMedia(
  client: PoolClient,
  slug: string,
  input: { kind?: string; filename?: string; mime?: string; bytesBase64?: string; alt?: string },
): Promise<{ offer: OfferRow; src: string; id: string }> {
  await getOfferRow(client, slug, { includeDraft: true });
  const kind = cleanText(input.kind ?? "gallery", "Image kind", 20, true);
  if (kind !== "cover" && kind !== "hero" && kind !== "gallery") throw badRequest("Image kind must be cover, hero, or gallery");
  const filename = cleanText(input.filename ?? "image.jpg", "Filename", 180, true);
  const mime = cleanText(input.mime ?? "", "Image type", 80, true).toLowerCase();
  if (!/\.(jpe?g|png|webp)$/i.test(filename) || !ALLOWED_MIME.has(mime)) throw badRequest(UNSUPPORTED_IMAGE);
  if (typeof input.bytesBase64 !== "string" || !input.bytesBase64) throw badRequest("Image data is required");
  const bytes = Buffer.from(input.bytesBase64, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw badRequest("Image must be 1.5 MB or smaller");
  const sniffed = sniffImage(bytes);
  const declared = mime === "image/jpg" ? "image/jpeg" : mime;
  if (!sniffed || sniffed !== declared) throw badRequest(UNSUPPORTED_IMAGE);
  const alt = cleanText(input.alt ?? "", "Alt text", 160);
  const id = uid("img");
  await client.query(
    `insert into offer_media (id, offer_slug, kind, sort_order, filename, mime, bytes, alt)
     values ($1,$2,$3,coalesce((select max(sort_order)+1 from offer_media where offer_slug=$2), 0),$4,$5,$6,$7)`,
    [id, slug, kind, filename, sniffed, bytes, alt],
  );
  const src = mediaPath(slug, id);
  let sql = `update offers set updated_at = now()`;
  const params: unknown[] = [slug];
  if (kind === "cover") {
    sql += `, image = $2, image_alt = coalesce(nullif($3,''), image_alt)`;
    params.push(src, alt);
  } else if (kind === "hero") {
    sql += `, hero_image = $2, hero_image_alt = coalesce(nullif($3,''), hero_image_alt)`;
    params.push(src, alt);
  } else {
    sql += `, gallery = coalesce(gallery, '[]'::jsonb) || to_jsonb($2::text)`;
    params.push(src);
  }
  sql += ` where slug = $1 returning *`;
  const { rows } = await client.query<OfferRow>(sql, params);
  return { offer: (await withInventory(client, [rows[0]!]))[0]!, src, id };
}

export async function removeOfferMedia(client: PoolClient, slug: string, mediaId: string): Promise<OfferRow> {
  const existing = await getOfferRow(client, slug, { includeDraft: true });
  const { rows: mediaRows } = await client.query<{ id: string; filename: string }>(
    `delete from offer_media where id = $1 and offer_slug = $2 returning id, filename`,
    [mediaId, slug],
  );
  const removed = mediaRows[0];
  if (!removed) throw notFound("Image not found");
  const path = mediaPath(slug, removed.id);
  const gallery = (Array.isArray(existing.gallery) ? existing.gallery : []).filter(
    (item): item is string => typeof item === "string" && !referenceDropped(item, path, removed.filename),
  );
  const image = existing.image && referenceDropped(existing.image, path, removed.filename) ? null : existing.image;
  const hero = existing.hero_image && referenceDropped(existing.hero_image, path, removed.filename) ? null : existing.hero_image;
  const { rows } = await client.query<OfferRow>(
    `update offers set image = $2, hero_image = $3, gallery = $4::jsonb, updated_at = now()
      where slug = $1 returning *`,
    [slug, image, hero, JSON.stringify(gallery)],
  );
  return (await withInventory(client, [rows[0]!]))[0]!;
}

export async function getOfferMedia(
  client: PoolClient,
  slug: string,
  id: string,
): Promise<{ bytes: Buffer; mime: string; filename: string }> {
  const { rows } = await client.query<{ bytes: Buffer; mime: string; filename: string; status: string }>(
    `select m.bytes, m.mime, m.filename, o.status
       from offer_media m join offers o on o.slug = m.offer_slug
      where m.id = $1 and m.offer_slug = $2`,
    [id, slug],
  );
  const media = rows[0];
  if (!media) throw notFound("Image not found");
  return { bytes: media.bytes, mime: media.mime, filename: media.filename };
}
