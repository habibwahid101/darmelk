import type { PoolClient } from "pg";
import { badRequest, notFound } from "../errors.js";
import { uid } from "../ids.js";

export const CONTACT_STATUSES = ["new", "reviewed", "closed"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export type ContactRequest = {
  id: string;
  name: string;
  profession: string;
  mobile: string;
  location: string;
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

export async function createContactRequest(
  client: PoolClient,
  data: { name?: string; profession?: string; mobile?: string; location?: string },
): Promise<ContactRequest> {
  const name = requiredText(data.name, "Name");
  const profession = requiredText(data.profession, "Profession");
  const mobile = requiredText(data.mobile, "Mobile", 32);
  const location = requiredText(data.location, "Location");
  if (!/^[+\d][\d\s()-]{6,30}$/.test(mobile)) {
    throw badRequest("Enter a valid mobile number", "invalid_contact");
  }
  const id = uid("cr");
  const { rows } = await client.query<ContactRequest>(
    `insert into contact_requests (id, name, profession, mobile, location, status)
     values ($1, $2, $3, $4, $5, 'new')
     returning *`,
    [id, name, profession, mobile, location],
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
