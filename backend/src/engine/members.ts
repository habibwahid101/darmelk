import type { PoolClient } from "pg";
import { badRequest, conflict, forbidden } from "../errors.js";
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
 * Auto-provision the `members` row for a Better Auth user on first contact
 * (mirrors the prototype's `ensureMember`, but persisted). Only identities
 * explicitly listed in ADMIN_EMAILS are granted the admin role; every other
 * account starts as a plain member.
 */
export async function ensureMember(
  client: PoolClient,
  user: { id: string; email: string },
): Promise<Member> {
  const existing = await client.query<Member>(`select * from members where user_id = $1`, [user.id]);
  if (existing.rows[0]) return existing.rows[0];

  const isAdminEmail = adminEmails().has(user.email.toLowerCase());

  const inserted = await client.query<Member>(
    `insert into members (user_id, referral_code, role)
     values ($1, $2, $3)
     on conflict (user_id) do nothing
     returning *`,
    [user.id, referralCodeFrom(user.id), isAdminEmail ? "admin" : "member"],
  );
  if (inserted.rows[0]) return inserted.rows[0];
  // Lost the insert race — someone else provisioned it concurrently.
  const row = await client.query<Member>(`select * from members where user_id = $1`, [user.id]);
  if (!row.rows[0]) throw new Error("member provisioning failed");
  return row.rows[0];
}

/**
 * Complete onboarding: records the sponsor relationship from a referral code
 * and places the member into the unified 3x5 matrix (spillover under the
 * sponsor if the sponsor's own 3 slots are full).
 *
 * Normal new members MUST supply a valid sponsor code. The approved
 * root/owner exception remains: the first onboarded member, and admin-role
 * accounts, may complete without a sponsor and become a matrix root.
 * Once a sponsor is bound, it is never replaced.
 */
export async function completeOnboarding(
  client: PoolClient,
  userId: string,
  data: { phone: string; sponsorCode: string },
): Promise<Member> {
  const { rows: existingRows } = await client.query<Member>(`select * from members where user_id = $1`, [userId]);
  const existing = existingRows[0];
  if (!existing) throw conflict("Member not found");
  if (existing.onboarding_complete) return existing;

  const code = data.sponsorCode.trim().toUpperCase();
  const { rows: countRows } = await client.query<{ n: string }>(
    `select count(*)::text as n from members where onboarding_complete = true and user_id <> $1`,
    [userId],
  );
  const otherOnboarded = Number(countRows[0]?.n ?? 0);
  const canSkipSponsor = otherOnboarded === 0 || existing.role === "admin";

  let sponsor: Member | undefined;
  if (code) {
    const { rows } = await client.query<Member>(`select * from members where referral_code = $1`, [code]);
    sponsor = rows[0];
    if (!sponsor) throw badRequest("Sponsor code not found", "sponsor_not_found");
    if (sponsor.user_id === userId) throw badRequest("You cannot sponsor yourself", "self_sponsor");
    await requireActiveMember(client, sponsor.user_id, "Sponsor is not annually active");
  } else if (!canSkipSponsor) {
    throw badRequest("Sponsor referral code is required", "sponsor_required");
  }

  let networkParentId: string | null = null;
  let networkSlot: number | null = null;
  if (sponsor) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const slot = await findOpenMatrixSlot(client, sponsor.user_id);
        networkParentId = slot.parentUserId;
        networkSlot = slot.slot;
        break;
      } catch (err) {
        if (attempt === 4) throw err;
      }
    }
  }

  const { rows } = await client.query<Member>(
    `update members set
        phone = $2,
        sponsor_user_id = $3,
        network_parent_user_id = $4,
        network_slot = $5,
        onboarding_complete = true,
        updated_at = now()
      where user_id = $1 and onboarding_complete = false
      returning *`,
    [userId, data.phone.trim(), sponsor?.user_id ?? null, networkParentId, networkSlot],
  );
  if (!rows[0]) {
    const again = await client.query<Member>(`select * from members where user_id = $1`, [userId]);
    if (again.rows[0]?.onboarding_complete) return again.rows[0];
    throw conflict("Member not found");
  }
  return rows[0];
}

/** Refresh a stale active row at the point of use, then enforce the annual
 * activation privilege gate without deleting or rewriting history. */
export async function requireActiveMember(
  client: PoolClient,
  userId: string,
  message = "Annual activation is required",
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
