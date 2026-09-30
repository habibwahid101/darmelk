import type { PoolClient } from "pg";
import { ApiError, badRequest, conflict, forbidden } from "../errors.js";
import { REFERRAL_INACTIVE, REFERRAL_NOT_FOUND, REFERRAL_REQUIRED } from "../referral-messages.js";
import { referralCodeFrom, uid } from "../ids.js";
import { findOpenMatrixSlot } from "./network.js";

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505");
}

export type Member = {
  user_id: string;
  referral_code: string;
  phone: string;
  role: "member" | "admin";
  sponsor_user_id: string | null;
  network_parent_user_id: string | null;
  network_slot: number | null;
  onboarding_complete: boolean;
  activation_status: "inactive" | "pending" | "active" | "expired";
  activation_expires_at: string | null;
  created_at: string;
};

/**
 * Load an existing member. Does not insert.
 * An auth identity with no members row is an incomplete registration and must
 * finish through registerMemberWithActiveReferral. Existing rows are returned
 * unchanged.
 */
export async function ensureMember(
  client: PoolClient,
  user: { id: string; email: string },
): Promise<Member> {
  const existing = await client.query<Member>(`select * from members where user_id = $1`, [user.id]);
  if (existing.rows[0]) return existing.rows[0];
  throw conflict(
    "Incomplete registration. An active Referral ID is required before a Darmelk member record can be created.",
    "incomplete_registration",
  );
}

/**
 * Authoritative referral check shared by the pre-signup hook and onboarding.
 * Uses requireActiveMember so "active" matches the Growth engine, including
 * expiry. Does not create a user, account, or member.
 */
export async function assertSignupReferral(
  client: PoolClient,
  rawCode: string,
  opts: { selfUserId?: string | null } = {},
): Promise<Member> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) throw badRequest(REFERRAL_REQUIRED, "referral_required");
  const { rows } = await client.query<Member>(`select * from members where referral_code = $1`, [code]);
  const sponsor = rows[0];
  if (!sponsor) throw badRequest(REFERRAL_NOT_FOUND, "referral_not_found");
  if (opts.selfUserId && sponsor.user_id === opts.selfUserId) {
    throw badRequest("You cannot sponsor yourself", "self_sponsor");
  }
  try {
    await requireActiveMember(client, sponsor.user_id);
  } catch (err) {
    if (err instanceof ApiError) throw badRequest(REFERRAL_INACTIVE, "sponsor_inactive");
    throw err;
  }
  const refreshed = await client.query<Member>(`select * from members where user_id = $1`, [sponsor.user_id]);
  return refreshed.rows[0] ?? sponsor;
}

/**
 * Create the member and permanent sponsor/network placement only after an
 * active referral validates. A completed member is returned unchanged —
 * sponsor and genealogy are never replaced. A completed sponsorless member
 * (historical General account) is also left unchanged.
 */
export async function registerMemberWithActiveReferral(
  client: PoolClient,
  user: { id: string; email: string },
  data: { phone?: string; sponsorCode?: string },
): Promise<Member> {
  const { rows: locked } = await client.query<Member>(`select * from members where user_id = $1 for update`, [user.id]);
  const existing = locked[0];
  if (existing?.onboarding_complete) return existing;

  if (existing?.sponsor_user_id) {
    const { rows } = await client.query<Member>(
      `update members set phone = $2, onboarding_complete = true, updated_at = now()
        where user_id = $1 and sponsor_user_id = $3
        returning *`,
      [user.id, (data.phone ?? existing.phone ?? "").trim(), existing.sponsor_user_id],
    );
    return rows[0] ?? existing;
  }

  const sponsor = await assertSignupReferral(client, data.sponsorCode ?? "", { selfUserId: user.id });
  const role = existing?.role ?? (adminEmails().has(user.email.toLowerCase()) ? "admin" : "member");
  const phone = (data.phone ?? "").trim();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const slot = await findOpenMatrixSlot(client, sponsor.user_id);
      if (!existing) {
        const inserted = await client.query<Member>(
          `insert into members (
             user_id, referral_code, phone, role,
             sponsor_user_id, network_parent_user_id, network_slot, onboarding_complete
           ) values ($1, $2, $3, $4, $5, $6, $7, true)
           returning *`,
          [user.id, referralCodeFrom(user.id), phone, role, sponsor.user_id, slot.parentUserId, slot.slot],
        );
        if (!inserted.rows[0]) throw conflict("Could not complete registration");
        return inserted.rows[0];
      }
      const { rows } = await client.query<Member>(
        `update members set
            phone = $2,
            sponsor_user_id = $3,
            network_parent_user_id = $4,
            network_slot = $5,
            onboarding_complete = true,
            updated_at = now()
          where user_id = $1
            and sponsor_user_id is null
            and onboarding_complete = false
          returning *`,
        [user.id, phone, sponsor.user_id, slot.parentUserId, slot.slot],
      );
      if (rows[0]) return rows[0];
      const again = await client.query<Member>(`select * from members where user_id = $1`, [user.id]);
      if (again.rows[0]?.onboarding_complete) return again.rows[0];
      throw conflict("Could not complete registration");
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue;
      throw err;
    }
  }
  throw conflict("Could not complete registration");
}

/**
 * Finish registration for an existing auth identity. Referral is mandatory
 * until a sponsor is stored. Once onboarding_complete, the row is never rewritten.
 */
export async function completeOnboarding(
  client: PoolClient,
  userId: string,
  data: { phone: string; sponsorCode?: string },
): Promise<Member> {
  const user = await client.query<{ id: string; email: string }>(`select id, email from "user" where id = $1`, [userId]);
  if (!user.rows[0]) throw conflict("Member not found");
  return registerMemberWithActiveReferral(client, user.rows[0], data);
}

/**
 * Bind a sponsor to an existing sponsorless General account when that member
 * explicitly enters the Growth Program. Not a generic sponsor-edit API:
 * existing sponsors are never replaced, and binding is atomic with exactly
 * one matrix placement via the existing 3x5 engine.
 *
 * Does not post commission, activate the member, create a booking, or
 * trigger promotion / qualification / Leadership.
 */
export async function bindSponsorForGrowth(
  client: PoolClient,
  userId: string,
  sponsorCode: string,
): Promise<{ member: Member; alreadyBound: boolean }> {
  const { rows: locked } = await client.query<Member>(`select * from members where user_id = $1 for update`, [userId]);
  const existing = locked[0];
  if (!existing) throw conflict("Member not found");

  if (existing.sponsor_user_id) {
    return { member: existing, alreadyBound: true };
  }
  if (existing.network_parent_user_id != null || existing.network_slot != null) {
    throw conflict("Account has existing network placement without a sponsor", "inconsistent_network");
  }

  const code = (sponsorCode ?? "").trim().toUpperCase();
  if (!code) throw badRequest("Referral ID is required to join the Growth Program", "growth_referral_required");

  const { rows: sponsorRows } = await client.query<Member>(`select * from members where referral_code = $1`, [code]);
  const sponsor = sponsorRows[0];
  if (!sponsor) throw badRequest("Referral ID not found", "sponsor_not_found");
  if (sponsor.user_id === userId) throw badRequest("You cannot sponsor yourself", "self_sponsor");
  await requireActiveMember(client, sponsor.user_id, "Sponsor is not annually active");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const slot = await findOpenMatrixSlot(client, sponsor.user_id);
      const { rows } = await client.query<Member>(
        `update members set
            sponsor_user_id = $2,
            network_parent_user_id = $3,
            network_slot = $4,
            onboarding_complete = true,
            updated_at = now()
          where user_id = $1
            and sponsor_user_id is null
            and network_parent_user_id is null
            and network_slot is null
          returning *`,
        [userId, sponsor.user_id, slot.parentUserId, slot.slot],
      );
      if (rows[0]) return { member: rows[0], alreadyBound: false };
      const again = await client.query<Member>(`select * from members where user_id = $1`, [userId]);
      if (again.rows[0]?.sponsor_user_id) return { member: again.rows[0], alreadyBound: true };
      throw conflict("Could not bind referral");
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue;
      throw err;
    }
  }
  throw conflict("Could not bind referral");
}

/** Refresh a stale active row at the point of use, then enforce the annual
 * Growth Program activation privilege gate without deleting or rewriting history. */
export async function requireActiveMember(
  client: PoolClient,
  userId: string,
  message = "Growth Program activation is required",
): Promise<Member> {
  await client.query(
    `update members set activation_status = 'expired', updated_at = now()
      where user_id = $1 and activation_status = 'active'
        and activation_expires_at is not null and activation_expires_at <= now()`,
    [userId],
  );
  await client.query(
    `update annual_activations set status = 'expired'
      where user_id = $1 and status = 'active' and period_end <= now()`,
    [userId],
  );
  const { rows } = await client.query<Member>(`select * from members where user_id = $1`, [userId]);
  const member = rows[0];
  if (!member || member.activation_status !== "active") throw forbidden(message);
  return member;
}

export async function requireActiveGrowthProgram(
  client: PoolClient,
  userId: string,
  message = "Growth Program activation is required",
): Promise<Member> {
  return requireActiveMember(client, userId, message);
}

export async function requireAdmin(client: PoolClient, userId: string): Promise<Member> {
  const { rows } = await client.query<Member>(`select * from members where user_id = $1`, [userId]);
  const member = rows[0];
  if (!member || member.role !== "admin") throw forbidden("Admin role required");
  return member;
}

export async function logAdminAction(
  client: PoolClient,
  opts: { adminUserId: string; actionType: string; targetType: string; targetId: string; payload?: unknown },
): Promise<void> {
  await client.query(
    `insert into admin_actions (id, admin_user_id, action_type, target_type, target_id, payload)
     values ($1, $2, $3, $4, $5, $6)`,
    [uid("aa"), opts.adminUserId, opts.actionType, opts.targetType, opts.targetId, JSON.stringify(opts.payload ?? {})],
  );
}
