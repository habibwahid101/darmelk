import type { PoolClient } from "pg";
import { badRequest, notFound } from "../errors.js";
import { uid } from "../ids.js";

export const CONTACT_STATUSES = ["new", "reviewed", "closed"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const CONTACT_SOURCES = ["contact", "request_to_book"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export type ContactRequest = {
  id: string;
  name: string;
  profession: string;
  mobile: string;
  location: string;
  offer_slug: string | null;
  offer_title: string | null;
  source: ContactSource;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by_admin_id: string | null;
};

function requiredText(value: unknown, field: string, max = 120): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw badRequest(`${field} is required`, "invalid_contact");
  if (text.length > max) throw badRequest(`${field} is too long`, "invalid_contact");
  return text;
}

function optionalSlug(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text) || text.length > 80) {
    throw badRequest("Property reference is invalid", "invalid_contact");
  }
  return text;
}

export async function createContactRequest(
  client: PoolClient,
  data: {
    name?: string;
    profession?: string;
    mobile?: string;
    location?: string;
    offerSlug?: string;
    source?: string;
  },
): Promise<ContactRequest> {
  const name = requiredText(data.name, "Name");
  const profession = requiredText(data.profession, "Profession");
  const mobile = requiredText(data.mobile, "Mobile", 32);
  const location = requiredText(data.location, "Location");
  if (!/^[+\d][\d\s()-]{6,30}$/.test(mobile)) {
    throw badRequest("Enter a valid mobile number", "invalid_contact");
  }

  const offerSlug = optionalSlug(data.offerSlug);
  let offerTitle: string | null = null;
  let source: ContactSource = data.source === "request_to_book" || offerSlug ? "request_to_book" : "contact";
  if (source === "request_to_book" && !offerSlug) {
    throw badRequest("Select a property to request to book", "invalid_contact");
  }
  if (offerSlug) {
    const { rows } = await client.query<{ slug: string; title: string }>(
      `select slug, title from offers where slug = $1 and status in ('published', 'available')`,
      [offerSlug],
    );
    if (!rows[0]) throw badRequest("Property not found", "invalid_contact");
    offerTitle = rows[0].title;
    source = "request_to_book";
  }

  const id = uid("cr");
  const { rows } = await client.query<ContactRequest>(
    `insert into contact_requests (id, name, profession, mobile, location, offer_slug, offer_title, source, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'new')
     returning *`,
    [id, name, profession, mobile, location, offerSlug, offerTitle, source],
  );
  return rows[0]!;
}

export async function listContactRequests(client: PoolClient): Promise<ContactRequest[]> {
  const { rows } = await client.query<ContactRequest>(
    `select * from contact_requests order by created_at desc`,
  );
  return rows;
}

export async function updateContactRequestStatus(
  client: PoolClient,
  id: string,
  status: string,
  adminUserId: string,
): Promise<ContactRequest> {
  if (!CONTACT_STATUSES.includes(status as ContactStatus)) {
    throw badRequest("Invalid status", "invalid_status");
  }
  const { rows } = await client.query<ContactRequest>(
    `update contact_requests
        set status = $2,
            updated_at = now(),
            reviewed_at = now(),
            reviewed_by_admin_id = $3
      where id = $1
      returning *`,
    [id, status, adminUserId],
  );
  if (!rows[0]) throw notFound("Contact request not found");
  return rows[0];
}
