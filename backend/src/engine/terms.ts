import type { PoolClient } from "pg";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { uid } from "../ids.js";

export const DOCUMENT_KEYS = [
  "GENERAL_TERMS",
  "PRIVACY_POLICY",
  "PROPERTY_BOOKING_TERMS",
  "GROWTH_PROGRAM_TERMS",
  "GROWTH_ACTIVATION_TERMS",
  "DARMELK_PAYMENT_TERMS",
  "MERCHANT_PAYMENT_TERMS",
  "PROMOTION_TERMS",
] as const;

export type DocumentKey = (typeof DOCUMENT_KEYS)[number];
export type ConsentContext =
  | "signup"
  | "growth_activation"
  | "booking"
  | "merchant_bundle"
  | "merchant_payment"
  | "promotion";

export type PolicyDocument = {
  key: DocumentKey;
  version: string;
  slug: string;
  title: string;
  effectiveDate: string;
  summary: string;
  paragraphs: string[];
};

export type UserConsent = {
  id: string;
  user_id: string;
  document_key: DocumentKey;
  document_version: string;
  context: ConsentContext;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  accepted_at: string;
};

const LEGAL_NOTE =
  "This wording describes current Darmelk product behaviour. It is not legal advice and is not a substitute for licensed Bangladesh legal counsel.";

export const POLICY_DOCUMENTS: Record<DocumentKey, PolicyDocument> = {
  GENERAL_TERMS: {
    key: "GENERAL_TERMS",
    version: "1",
    slug: "general",
    title: "Darmelk Terms",
    effectiveDate: "2026-09-15",
    summary: "A Darmelk account is free. These terms cover ordinary account use and marketplace enquiry. They do not enrol you in the Growth Program.",
    paragraphs: [
      "Darmelk is a property gateway. A Darmelk account is free. Creating an account lets you sign in, keep a profile, browse published properties, and submit a Request to Book.",
      "A Request to Book is an enquiry. It does not confirm a booking, reserve a property, take payment, or create commission, qualification, or Growth Program membership.",
      "Referral ID is optional on General signup. Adding a referral is a Growth Program choice. Accepting these General Terms does not join the Growth Program, place you in the 3×5 network, or require the annual Growth Program Activation fee.",
      "Information you submit must be accurate and belong to you. Use Darmelk only for lawful account, enquiry, booking, and financial activity.",
      "Published property figures belong to that offer. Darmelk does not guarantee income, investment return, or property appreciation.",
      "Detailed operating behaviour for the optional Growth Program is described separately in the Growth Program Terms and Program Rules.",
      LEGAL_NOTE,
    ],
  },
  PRIVACY_POLICY: {
    key: "PRIVACY_POLICY",
    version: "1",
    slug: "privacy",
    title: "Privacy Policy",
    effectiveDate: "2026-09-15",
    summary: "Darmelk records the account, enquiry, booking, payment, and audit information needed to operate the service.",
    paragraphs: [
      "Darmelk records account identity, profile, booking, activation, payment evidence, network, commission, payout, withdrawal, consent, and audit information needed to operate the service.",
      "Payment proof and payout credentials are restricted to the member and authorized operational access. Historical financial snapshots remain connected to the transaction they document.",
      "Consent records store the document key, version, time, and relevant context. Historical acceptance rows are not rewritten when a later policy version is published.",
      "Do not submit unnecessary personal or sensitive information in optional notes.",
      LEGAL_NOTE,
    ],
  },
  GROWTH_PROGRAM_TERMS: {
    key: "GROWTH_PROGRAM_TERMS",
    version: "1",
    slug: "growth-program",
    title: "Growth Program Terms",
    effectiveDate: "2026-09-15",
    summary: "The Growth Program is optional. It uses the same Darmelk account and requires a valid sponsor before annual activation.",
    paragraphs: [
      "The Growth Program is optional. It uses the same Darmelk account, session, backend, and database. Joining does not create a second identity.",
      "A valid Referral ID is required before Growth Program Activation. The sponsor relationship is permanent once confirmed and is never replaced.",
      "Placement follows the current 3×5 matrix. Qualification requires 3 personal eligible sponsors and completion through Level 5 (3, 9, 27, 81, and 243 positions).",
      "Commission rates on eligible confirmed booking amounts are Level 1 10%, Level 2 8%, Level 3 6%, Level 4 4%, and Level 5 2%. Commission is created only after an authoritative booking confirmation. Reversals remain recorded; history is not silently deleted.",
      "Property commercial terms remain offer-specific. Qualification benefit stays attached to the booked offer snapshot. Promotion is a separate, campaign-specific engine.",
      "Growth property booking, when the member is Growth-active, is paid via Darmelk Bank or Pay by Merchant. Merchant approval does not confirm the booking. Inventory is consumed only at authoritative booking confirmation.",
      "Growth Program Activation is BDT 1,000 per year and is separate from property booking and property payment. Historical network, commission, qualification, Leadership, booking, and ledger records remain auditable after expiry.",
      "Darmelk does not guarantee income. These terms describe current product rules, not earnings promises.",
      LEGAL_NOTE,
    ],
  },
  GROWTH_ACTIVATION_TERMS: {
    key: "GROWTH_ACTIVATION_TERMS",
    version: "1",
    slug: "growth-activation",
    title: "Growth Program Activation Terms",
    effectiveDate: "2026-09-15",
    summary: "Growth Program Activation is BDT 1,000 per year, paid by bKash, Nagad, or Darmelk Bank, and starts only after verification.",
    paragraphs: [
      "Growth Program Activation costs BDT 1,000 per year. The fee applies only to Growth Program privileges. A General Darmelk account remains free.",
      "A valid sponsor/referral must already be linked before activation can be requested. Activation does not create a new sponsor or a new matrix placement.",
      "Payment methods for activation are bKash, Nagad, and Darmelk Bank only. Pay by Merchant and Merchant Credit cannot pay activation.",
      "Submitting payment proof does not activate Growth privileges. Activation begins only after authoritative admin verification of a pending request.",
      "The activation period is one year using the current production duration rules. On expiry, the Darmelk account, sponsor, network history, bookings, wallet/ledger, commission, qualification, and Leadership history remain. New Growth earning, sponsoring, Growth booking, and withdrawal privileges pause until renewal according to current policy.",
      "Renewal restores the Growth activation period. It does not restart qualification, reset Leadership, reset commissions, or create a second network placement.",
      "Rejected, duplicate, or invalid payment submissions follow the current payment-review system. Darmelk does not promise a refund in these terms.",
      "Activation is separate from property booking. It does not create a booking, consume inventory, post property commission, settle Merchant credit, or trigger Promotion qualification.",
      LEGAL_NOTE,
    ],
  },
  PROPERTY_BOOKING_TERMS: {
    key: "PROPERTY_BOOKING_TERMS",
    version: "1",
    slug: "booking",
    title: "Property Booking Terms",
    effectiveDate: "2026-09-15",
    summary: "A Growth booking freezes the selected offer’s commercial terms. Confirmation is authoritative and separate from payment submission.",
    paragraphs: [
      "A binding Growth property booking freezes the selected offer’s commercial snapshot, including booking amount, property price, and any stored full-payment or installment terms.",
      "A Request to Book on the public marketplace remains an enquiry and is not this booking.",
      "Growth booking payment methods are Darmelk Bank and Pay by Merchant. bKash and Nagad are not booking payment methods.",
      "Payment submission and Merchant approval do not confirm the booking. Darmelk confirms and activates the booking through the existing administrative path. Inventory is consumed once at that confirmation.",
      "Cancellation and reversal follow the current booking engine. Reversal does not restore consumed inventory.",
      LEGAL_NOTE,
    ],
  },
  DARMELK_PAYMENT_TERMS: {
    key: "DARMELK_PAYMENT_TERMS",
    version: "1",
    slug: "payment",
    title: "Darmelk Payment Terms",
    effectiveDate: "2026-09-15",
    summary: "Manual payment destinations are reviewed. Submission is not approval.",
    paragraphs: [
      "Manual payments use the published Darmelk destinations for the relevant context. Send the exact amount and keep the transaction reference.",
      "Upload of proof places the submission under review. Privileges or bookings change only after authoritative approval.",
      "Growth Program Activation and property booking are separate payments.",
      LEGAL_NOTE,
    ],
  },
  MERCHANT_PAYMENT_TERMS: {
    key: "MERCHANT_PAYMENT_TERMS",
    version: "1",
    slug: "merchant-payment",
    title: "Merchant Payment Terms",
    effectiveDate: "2026-09-15",
    summary: "Merchant approval reserves credit. It does not confirm a booking.",
    paragraphs: [
      "Pay by Merchant creates a payment request for an active Merchant. No password or OTP is collected by Darmelk for this request.",
      "If the Merchant approves, Merchant Credit is reserved. Merchant approval does not confirm the booking, activate it, consume inventory, create commission, or evaluate Promotion.",
      "Successful authoritative booking confirmation settles the reserved credit once. Failed or cancelled paths release credit according to the current Merchant engine.",
      "Merchant Credit is separate from the Commission Wallet.",
      LEGAL_NOTE,
    ],
  },
  PROMOTION_TERMS: {
    key: "PROMOTION_TERMS",
    version: "1",
    slug: "promotion",
    title: "Promotion Terms",
    effectiveDate: "2026-09-15",
    summary:
      "Promotions are campaign-specific. Qualification follows an authoritative confirmed Darmelk property booking, not a payment method.",
    paragraphs: [
      "Promotions are campaign-specific. Qualification, timing, eligible properties, and rewards follow the selected campaign’s stored rules and the campaign window.",
      "Qualification is created only from an existing authoritative confirmed or activated Darmelk property booking whose confirmation time falls inside the campaign window on an eligible offer. Darmelk Bank bookings and Pay by Merchant bookings qualify through that same confirmation path.",
      "Merchant approval, payment submission, a pending booking, a Request to Book, a Contact enquiry, and Growth Program Activation do not qualify. Creating a booking is not enough.",
      "A promotion is separate from Growth Program Activation, property booking economics, commission, qualification progress, Leadership Reward, and Merchant Credit. Promotion itself does not generate commission.",
      "One member may qualify once per campaign. The same booking cannot duplicate the same campaign. One booking may independently qualify for more than one applicable campaign.",
      "Campaign terms, where stored, remain attached to that campaign and are snapshotted at qualification. Historical qualifications remain after a campaign closes or expires.",
      "Darmelk does not guarantee a promotion reward, gift, income, or fulfillment outcome. Reward eligibility is separate from fulfillment.",
      LEGAL_NOTE,
    ],
  },
};

const KEY_SET = new Set<string>(DOCUMENT_KEYS);

export function isDocumentKey(value: unknown): value is DocumentKey {
  return typeof value === "string" && KEY_SET.has(value);
}

export function getPolicy(key: string): PolicyDocument {
  if (!isDocumentKey(key)) throw notFound("Terms document not found");
  return POLICY_DOCUMENTS[key];
}

export function listCurrentPolicies(keys?: string[]) {
  const selected = keys?.length ? keys : [...DOCUMENT_KEYS];
  return selected.map((key) => getPolicy(key));
}

export function policyBySlug(slug: string): PolicyDocument | undefined {
  return Object.values(POLICY_DOCUMENTS).find((doc) => doc.slug === slug);
}

export async function recordConsents(
  client: PoolClient,
  userId: string,
  input: {
    keys: DocumentKey[];
    context: ConsentContext;
    referenceId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<UserConsent[]> {
  if (!input.keys.length) throw badRequest("Terms acceptance is required", "terms_required");
  const recorded: UserConsent[] = [];
  const referenceId = input.referenceId ?? null;
  const referenceKey = referenceId ?? "";
  for (const key of input.keys) {
    const doc = await resolveCurrentPolicy(client, key);
    const { rows } = await client.query<UserConsent>(
      `insert into user_consents
         (id, user_id, document_key, document_version, context, reference_id, reference_key, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (user_id, document_key, document_version, context, reference_key)
       do nothing
       returning *`,
      [
        uid("cns"),
        userId,
        doc.key,
        doc.version,
        input.context,
        referenceId,
        referenceKey,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    if (rows[0]) {
      recorded.push(rows[0]);
      continue;
    }
    const existing = await client.query<UserConsent>(
      `select * from user_consents
        where user_id = $1 and document_key = $2 and document_version = $3 and context = $4
          and reference_key = $5`,
      [userId, doc.key, doc.version, input.context, referenceKey],
    );
    if (existing.rows[0]) recorded.push(existing.rows[0]);
  }
  return recorded;
}

export async function hasCurrentConsent(
  client: PoolClient,
  userId: string,
  key: DocumentKey,
): Promise<boolean> {
  const doc = await resolveCurrentPolicy(client, key);
  const { rows } = await client.query(
    `select 1 from user_consents
      where user_id = $1 and document_key = $2 and document_version = $3
      limit 1`,
    [userId, doc.key, doc.version],
  );
  return Boolean(rows[0]);
}

export async function hasCurrentConsentFor(
  client: PoolClient,
  userId: string,
  key: DocumentKey,
  context: ConsentContext,
  referenceId?: string | null,
): Promise<boolean> {
  const doc = await resolveCurrentPolicy(client, key);
  const referenceKey = referenceId ?? "";
  const { rows } = await client.query(
    `select 1 from user_consents
      where user_id = $1 and document_key = $2 and document_version = $3
        and context = $4 and reference_key = $5
      limit 1`,
    [userId, doc.key, doc.version, context, referenceKey],
  );
  return Boolean(rows[0]);
}

export async function requireCurrentConsentFor(
  client: PoolClient,
  userId: string,
  key: DocumentKey,
  context: ConsentContext,
  referenceId: string | null,
  message = "Required terms must be accepted",
): Promise<void> {
  if (!(await hasCurrentConsentFor(client, userId, key, context, referenceId))) {
    throw forbidden(message, "terms_required");
  }
}

export async function requireCurrentConsents(
  client: PoolClient,
  userId: string,
  keys: DocumentKey[],
  message = "Required terms must be accepted",
): Promise<void> {
  for (const key of keys) {
    if (!(await hasCurrentConsent(client, userId, key))) {
      throw forbidden(message, "terms_required");
    }
  }
}

export async function listUserConsents(client: PoolClient, userId: string): Promise<UserConsent[]> {
  const { rows } = await client.query<UserConsent>(
    `select * from user_consents where user_id = $1 order by accepted_at desc`,
    [userId],
  );
  return rows;
}

export const MANAGED_BOOKING_TERMS_KEY = "PROPERTY_BOOKING_TERMS" as const;

export type PolicyRevision = {
  id: string;
  document_key: DocumentKey;
  version: string;
  title: string;
  effective_date: string;
  summary: string;
  body: string;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by_admin_id: string | null;
  published_by_admin_id: string | null;
};

type RevisionInput = {
  version?: unknown;
  title?: unknown;
  effectiveDate?: unknown;
  effective_date?: unknown;
  summary?: unknown;
  body?: unknown;
};

function asDateText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? "").trim());
  return match ? match[1] : "";
}

export function paragraphsFromBody(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanRevisionText(value: unknown, label: string, max: number, required = false): string {
  if (value == null || value === "") {
    if (required) throw badRequest(`${label} is required`);
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${label} is required`);
  const text = value.trim();
  if (required && !text) throw badRequest(`${label} is required`);
  if (text.length > max) throw badRequest(`${label} is too long`);
  return text;
}

function parseEffectiveDate(value: unknown): string {
  const text = cleanRevisionText(value, "Effective date", 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest("Effective date must be a calendar date");
  const [year, month, day] = text.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month! - 1 || utc.getUTCDate() !== day) {
    throw badRequest("Effective date must be a calendar date");
  }
  return text;
}

function revisionToPolicy(row: PolicyRevision): PolicyDocument {
  const code = POLICY_DOCUMENTS.PROPERTY_BOOKING_TERMS;
  return {
    key: "PROPERTY_BOOKING_TERMS",
    version: row.version,
    slug: code.slug,
    title: row.title,
    effectiveDate: asDateText(row.effective_date),
    summary: row.summary,
    paragraphs: paragraphsFromBody(row.body),
  };
}

function serializeRevision(row: PolicyRevision): PolicyRevision {
  const asIso = (value: string | Date | null | undefined) => {
    if (value == null || value === "") return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  };
  return {
    ...row,
    effective_date: asDateText(row.effective_date),
    created_at: asIso(row.created_at) ?? "",
    updated_at: asIso(row.updated_at) ?? "",
    published_at: asIso(row.published_at),
  };
}

export async function resolveCurrentPolicy(client: PoolClient, key: DocumentKey): Promise<PolicyDocument> {
  if (!isDocumentKey(key)) throw notFound("Terms document not found");
  const code = POLICY_DOCUMENTS[key];
  if (key !== MANAGED_BOOKING_TERMS_KEY) return code;
  const { rows } = await client.query<PolicyRevision>(
    `select * from policy_revisions
      where document_key = $1 and status = 'published'
      order by published_at desc nulls last, created_at desc
      limit 1`,
    [key],
  );
  const row = rows[0];
  if (!row) return code;
  return revisionToPolicy(row);
}

export async function listResolvedPolicies(client: PoolClient, keys?: string[]): Promise<PolicyDocument[]> {
  const selected = keys?.length ? keys : [...DOCUMENT_KEYS];
  const documents: PolicyDocument[] = [];
  for (const key of selected) {
    if (!isDocumentKey(key)) throw notFound("Terms document not found");
    documents.push(await resolveCurrentPolicy(client, key));
  }
  return documents;
}

export async function resolvePolicyRequest(client: PoolClient, raw: string): Promise<PolicyDocument> {
  const code = policyBySlug(raw) ?? (isDocumentKey(raw) ? POLICY_DOCUMENTS[raw] : undefined);
  if (!code) throw notFound("Terms document not found");
  return resolveCurrentPolicy(client, code.key);
}

export async function getBookingTermsAdmin(client: PoolClient) {
  const current = await resolveCurrentPolicy(client, MANAGED_BOOKING_TERMS_KEY);
  const { rows } = await client.query<PolicyRevision>(
    `select * from policy_revisions
      where document_key = $1
      order by coalesce(published_at, created_at) desc, created_at desc`,
    [MANAGED_BOOKING_TERMS_KEY],
  );
  const published = rows.find((row) => row.status === "published" && row.version === current.version);
  return {
    key: MANAGED_BOOKING_TERMS_KEY,
    slug: POLICY_DOCUMENTS.PROPERTY_BOOKING_TERMS.slug,
    publicPath: "/terms?key=booking",
    current: {
      ...current,
      source: published ? "database" : "code",
      revisionId: published?.id ?? null,
      status: "published" as const,
      body: published?.body ?? current.paragraphs.join("\n\n"),
    },
    revisions: rows.map((row) => {
      const serialized = serializeRevision(row);
      return {
        ...serialized,
        current: row.status === "published" && row.version === current.version && row.id === published?.id,
      };
    }),
  };
}

async function assertVersionAvailable(client: PoolClient, version: string, exceptId?: string) {
  const { rows } = await client.query<{ id: string }>(
    `select id from policy_revisions where document_key = $1 and version = $2`,
    [MANAGED_BOOKING_TERMS_KEY, version],
  );
  const existing = rows[0];
  if (existing && existing.id !== exceptId) throw conflict("That terms version already exists", "terms_version_exists");
}

export async function createBookingTermsDraft(client: PoolClient, adminId: string, input: RevisionInput) {
  const version = cleanRevisionText(input.version, "Version", 40, true);
  const title = cleanRevisionText(input.title, "Title", 160, true);
  const effectiveDate = parseEffectiveDate(input.effectiveDate ?? input.effective_date);
  const summary = cleanRevisionText(input.summary, "Summary", 600);
  const body = cleanRevisionText(input.body, "Terms content", 20000, true);
  await assertVersionAvailable(client, version);
  const id = uid("term");
  const { rows } = await client.query<PolicyRevision>(
    `insert into policy_revisions
       (id, document_key, version, title, effective_date, summary, body, status, created_by_admin_id)
     values ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
     returning *`,
    [id, MANAGED_BOOKING_TERMS_KEY, version, title, effectiveDate, summary, body, adminId],
  );
  return serializeRevision(rows[0]!);
}

export async function updateBookingTermsDraft(client: PoolClient, id: string, input: RevisionInput) {
  const { rows: existingRows } = await client.query<PolicyRevision>(
    `select * from policy_revisions where id = $1 and document_key = $2`,
    [id, MANAGED_BOOKING_TERMS_KEY],
  );
  const existing = existingRows[0];
  if (!existing) throw notFound("Terms draft not found");
  if (existing.status !== "draft") throw conflict("Published terms cannot be edited", "terms_published_locked");
  const version = input.version == null ? existing.version : cleanRevisionText(input.version, "Version", 40, true);
  const title = input.title == null ? existing.title : cleanRevisionText(input.title, "Title", 160, true);
  const effectiveDate =
    input.effectiveDate == null && input.effective_date == null
      ? asDateText(existing.effective_date)
      : parseEffectiveDate(input.effectiveDate ?? input.effective_date);
  const summary = input.summary == null ? existing.summary : cleanRevisionText(input.summary, "Summary", 600);
  const body = input.body == null ? existing.body : cleanRevisionText(input.body, "Terms content", 20000, true);
  await assertVersionAvailable(client, version, id);
  const { rows } = await client.query<PolicyRevision>(
    `update policy_revisions
        set version = $2, title = $3, effective_date = $4, summary = $5, body = $6, updated_at = now()
      where id = $1 and status = 'draft'
      returning *`,
    [id, version, title, effectiveDate, summary, body],
  );
  if (!rows[0]) throw conflict("Published terms cannot be edited", "terms_published_locked");
  return serializeRevision(rows[0]);
}

export async function publishBookingTermsDraft(client: PoolClient, id: string, adminId: string) {
  const { rows } = await client.query<PolicyRevision>(
    `update policy_revisions
        set status = 'published', published_at = now(), published_by_admin_id = $2, updated_at = now()
      where id = $1 and document_key = $3 and status = 'draft'
      returning *`,
    [id, adminId, MANAGED_BOOKING_TERMS_KEY],
  );
  const published = rows[0];
  if (!published) {
    const { rows: found } = await client.query<{ status: string }>(
      `select status from policy_revisions where id = $1 and document_key = $2`,
      [id, MANAGED_BOOKING_TERMS_KEY],
    );
    if (!found[0]) throw notFound("Terms draft not found");
    throw conflict("Published terms cannot be edited", "terms_published_locked");
  }
  return serializeRevision(published);
}
