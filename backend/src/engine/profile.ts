import type { PoolClient } from "pg";
import { badRequest, conflict } from "../errors.js";

export const INVALID_PHONE_MESSAGE =
  "Enter a valid Bangladesh mobile number, like 01712345678 or +8801712345678.";

/**
 * Accept 01XXXXXXXXX or +8801XXXXXXXXX. Store +8801XXXXXXXXX.
 * Spaces and hyphens are ignored. Anything else is rejected.
 */
export function normalizeBdMobile(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest(INVALID_PHONE_MESSAGE, "invalid_phone");
  const compact = raw.replace(/[\s-]/g, "");
  if (/^01\d{9}$/.test(compact)) return `+880${compact.slice(1)}`;
  if (/^\+8801\d{9}$/.test(compact)) return compact;
  throw badRequest(INVALID_PHONE_MESSAGE, "invalid_phone");
}

/**
 * Update only the signed-in member's phone. Does not insert a member.
 * The only column written is phone (plus updated_at).
 */
export async function updateOwnMemberPhone(client: PoolClient, userId: string, rawPhone: unknown) {
  const phone = normalizeBdMobile(rawPhone);
  const existing = await client.query(`select user_id from members where user_id = $1`, [userId]);
  if (!existing.rows[0]) {
    throw conflict("Complete registration before updating your profile.", "incomplete_registration");
  }
  const updated = await client.query(
    `update members set phone = $2, updated_at = now() where user_id = $1 returning *`,
    [userId, phone],
  );
  return updated.rows[0];
}
