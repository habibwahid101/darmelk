import type { PoolClient } from "pg";
import { badRequest, conflict } from "../errors.js";
import { uid } from "../ids.js";
import { deriveInventory, soldForOffer } from "./inventory.js";

export const FLAGSHIP_SLUG = "five-star-hotel-share";
export const RESET_CONFIRMATION = "RESET DARMELK PRELAUNCH DATA";
export const PRELAUNCH_RESET_CONFIRMATION = RESET_CONFIRMATION;
export const RESET_VERSION = "1";
export const RESET_ACTION_TYPE = "ONE_TIME_PRELAUNCH_RESET";

export const RESET_SENSITIVE_TABLES = [
  "user", "session", "account", "verification", "members", "bookings", "booking_snapshots",
  "idempotency_keys", "commission_ledger", "reversal_entries", "withdrawals", "annual_activations",
  "admin_actions", "payment_submissions", "payout_methods", "commission_payout_allocations",
  "contact_requests", "leadership_reward_cycles", "leadership_reward_tier_events",
  "leadership_reward_entitlements", "merchants", "merchant_bundle_purchases",
  "merchant_payment_requests", "merchant_credit_ledger", "merchant_gift_fulfillments",
  "promotion_qualifications", "promotion_reward_fulfillments", "promotion_reward_events",
  "offer_inventory_events", "user_consents",
] as const;

export const PRESERVE_CATALOG_TABLES = [
  "_migrations", "offers", "offer_media", "jobs", "merchant_bundles", "promotions", "promotion_offers", "promotion_rewards",
] as const;

export const PRELAUNCH_DELETE_ORDER = [
  "verification", "user_consents", "promotion_reward_events", "promotion_reward_fulfillments",
  "promotion_qualifications", "offer_inventory_events", "merchant_gift_fulfillments",
  "merchant_credit_ledger", "merchant_payment_requests", "merchant_bundle_purchases", "merchants",
  "leadership_reward_entitlements", "leadership_reward_tier_events", "leadership_reward_cycles",
  "commission_payout_allocations", "reversal_entries", "payment_submissions", "booking_snapshots",
  "commission_ledger", "withdrawals", "annual_activations", "bookings", "payout_methods",
  "contact_requests", "idempotency_keys", "admin_actions",
] as const;

const LEDGER_NOTICE =
  "commission/reversal/withdrawal/admin_action history, booking snapshots, inventory events, and financial/payment history are normally append-only. This describes a ONE-TIME PRELAUNCH CLEAN RESET, not normal production behavior.";

export function maskEmail(email: string): string {
  const trimmed = (email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function quoted(table: string): string {
  return `"${table.replaceAll('"', "")}"`;
}

async function countTable(client: PoolClient, table: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from ${quoted(table)}`);
  return rows[0]?.n ?? 0;
}

async function countsFor(client: PoolClient, tables: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of tables) out[table] = await countTable(client, table);
  return out;
}

export async function countAuthOnlyNonAdminUsers(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from "user" u left join members m on m.user_id = u.id where m.user_id is null`,
  );
  return rows[0]?.n ?? 0;
}

async function resetAuditCount(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from admin_actions where action_type = $1`,
    [RESET_ACTION_TYPE],
  );
  return rows[0]?.n ?? 0;
}

export async function previewPrelaunchReset(client: PoolClient) {
  const reset_sensitive_counts = await countsFor(client, RESET_SENSITIVE_TABLES);
  const preserve_catalog_counts = await countsFor(client, PRESERVE_CATALOG_TABLES);
  const { rows: adminRows } = await client.query<{
    user_id: string; email: string | null; role: string; referral_code: string; activation_status: string;
    sponsor_user_id: string | null; network_parent_user_id: string | null; network_slot: number | null;
    auth_user_present: boolean; account_rows: number; session_rows: number;
  }>(
    `select m.user_id, u.email, m.role, m.referral_code, m.activation_status, m.sponsor_user_id,
            m.network_parent_user_id, m.network_slot, (u.id is not null) as auth_user_present,
            (select count(*)::int from "account" a where a."userId" = m.user_id) as account_rows,
            (select count(*)::int from "session" s where s."userId" = m.user_id) as session_rows
       from members m left join "user" u on u.id = m.user_id
      where m.role = 'admin' order by m.created_at asc`,
  );
  const nonAdminIds = new Set(
    (await client.query<{ user_id: string }>(`select user_id from members where role <> 'admin'`)).rows.map((r) => r.user_id),
  );
  const preserved_admins = adminRows.map((row) => ({
    user_id: row.user_id,
    masked_email: maskEmail(row.email ?? ""),
    role: row.role,
    referral_code: row.referral_code,
    activation_status: row.activation_status,
    sponsor_user_id: row.sponsor_user_id,
    network_parent_user_id: row.network_parent_user_id,
    network_slot: row.network_slot,
    points_to_non_admin: Boolean((row.sponsor_user_id && nonAdminIds.has(row.sponsor_user_id)) || (row.network_parent_user_id && nonAdminIds.has(row.network_parent_user_id))),
    auth_user_present: row.auth_user_present,
    account_rows: row.account_rows,
    session_rows: row.session_rows,
  }));
  const { rows: flagshipOffer } = await client.query<{ total_quantity: number | null }>(`select total_quantity from offers where slug = $1`, [FLAGSHIP_SLUG]);
  const { rows: consumeRows } = await client.query<{ n: number }>(`select count(*)::int as n from offer_inventory_events where offer_slug = $1 and event_type = 'consume'`, [FLAGSHIP_SLUG]);
  const sold = await soldForOffer(client, FLAGSHIP_SLUG);
  const inventory = deriveInventory(flagshipOffer[0]?.total_quantity ?? null, sold);
  const { rows: nonAdminRows } = await client.query<{ user_id: string; email: string | null; created_at: string; role: string; activation_status: string; booking_count: number }>(
    `select m.user_id, u.email, m.created_at, m.role, m.activation_status,
            (select count(*)::int from bookings b where b.user_id = m.user_id) as booking_count
       from members m left join "user" u on u.id = m.user_id
      where m.role <> 'admin' order by m.created_at asc`,
  );
  const auth_only_non_admin_users = await countAuthOnlyNonAdminUsers(client);
  const reset_audit_count = await resetAuditCount(client);
  const transactionalZero = [
    "bookings", "booking_snapshots", "offer_inventory_events", "commission_ledger", "reversal_entries",
    "withdrawals", "annual_activations", "payment_submissions", "payout_methods", "commission_payout_allocations",
    "contact_requests", "verification", "user_consents", "merchants", "merchant_bundle_purchases",
    "merchant_payment_requests", "merchant_credit_ledger", "merchant_gift_fulfillments",
    "leadership_reward_cycles", "leadership_reward_tier_events", "leadership_reward_entitlements",
    "promotion_qualifications", "promotion_reward_fulfillments", "promotion_reward_events", "idempotency_keys",
  ].every((table) => (reset_sensitive_counts[table] ?? 0) === 0);
  const already_clean = preserved_admins.length >= 1 && auth_only_non_admin_users === 0 && reset_audit_count >= 1 && transactionalZero && nonAdminRows.length === 0;
  return {
    ok: true as const,
    mode: "preview" as const,
    execution_authorized: false as const,
    destructive_endpoint: true as const,
    ledger_notice: LEDGER_NOTICE,
    preserved_admins,
    reset_sensitive_counts,
    preserve_catalog_counts,
    flagship: {
      slug: FLAGSHIP_SLUG,
      total_quantity: flagshipOffer[0]?.total_quantity ?? null,
      consume_events: consumeRows[0]?.n ?? 0,
      binding_bookings: 0,
      booking_statuses: {},
      sold: inventory.sold,
      reserved: inventory.reserved,
      available: inventory.available,
    },
    non_admin_members: nonAdminRows.map((row) => ({
      user_id: row.user_id,
      masked_email: maskEmail(row.email ?? ""),
      created_at: row.created_at,
      role: row.role,
      activation_status: row.activation_status,
      booking_count: row.booking_count,
    })),
    auth_only_non_admin_users,
    reset_audit_count,
    already_clean,
  };
}

export async function executePrelaunchReset(
  client: PoolClient,
  opts: { adminUserId: string; confirmation: unknown; abortAfterClear?: boolean },
) {
  if (opts.confirmation !== RESET_CONFIRMATION) {
    throw badRequest("Type the exact confirmation phrase to continue", "confirmation_required");
  }
  const before = await previewPrelaunchReset(client);
  if (before.already_clean) {
    throw conflict("Prelaunch data is already clean; refusing a second execution", "already_clean");
  }
  if (before.preserved_admins.length < 1) throw conflict("No admin member exists; refusing reset", "admin_missing");
  const executing = before.preserved_admins.find((row) => row.user_id === opts.adminUserId);
  if (!executing) throw conflict("Executing admin is not a preserved admin", "admin_missing");
  if (!executing.auth_user_present) throw conflict("Preserved admin is missing its auth user", "admin_auth_missing");
  if (executing.account_rows < 1) throw conflict("Preserved admin is missing its account row", "admin_account_missing");
  if (executing.points_to_non_admin) throw conflict("Preserved admin points at a non-admin network member", "unexpected_preservation_set");
  const { rows: flagship } = await client.query(`select slug from offers where slug = $1`, [FLAGSHIP_SLUG]);
  if (!flagship[0]) throw conflict("Flagship catalog offer is missing; prelaunch reset refused", "flagship_missing");
  if ((await countTable(client, "_migrations")) < 19) throw conflict("Darmelk schema is incomplete; prelaunch reset refused", "schema_incomplete");

  await client.query(`select user_id from members where user_id = $1 and role = 'admin' for update`, [opts.adminUserId]);
  for (const table of PRELAUNCH_DELETE_ORDER) {
    await client.query(`delete from ${quoted(table)}`);
  }
  await client.query(`update members set sponsor_user_id = null, network_parent_user_id = null, network_slot = null, updated_at = now() where role <> 'admin'`);
  await client.query(`delete from members where role <> 'admin'`);
  const adminIds = before.preserved_admins.map((row) => row.user_id);
  await client.query(`delete from "user" where id <> all($1::text[])`, [adminIds]);
  if (opts.abortAfterClear) throw new Error("test_rollback_probe");

  const mid = await previewPrelaunchReset(client);
  if (mid.preserved_admins.length !== adminIds.length) throw conflict("Admin preservation failed", "admin_not_preserved");
  if (mid.non_admin_members.length !== 0 || mid.auth_only_non_admin_users !== 0) throw conflict("Non-admin identities remain after reset", "identities_remain");
  if (mid.flagship.sold !== 0) throw conflict("Flagship sold is not zero after reset", "flagship_not_cleared");
  for (const table of PRESERVE_CATALOG_TABLES) {
    if (mid.preserve_catalog_counts[table] !== before.preserve_catalog_counts[table]) {
      throw conflict(`Catalog table ${table} changed during reset`, "catalog_changed");
    }
  }

  const auditId = uid("aa");
  await client.query(
    `insert into admin_actions (id, admin_user_id, action_type, target_type, target_id, payload)
     values ($1, $2, $3, $4, $5, $6)`,
    [auditId, opts.adminUserId, RESET_ACTION_TYPE, "system", "prelaunch-reset", JSON.stringify({
      action: RESET_ACTION_TYPE,
      reset_version: RESET_VERSION,
      executed_at: new Date().toISOString(),
      executing_admin_id: opts.adminUserId,
      production_sha: (process.env.GITHUB_SHA ?? "").trim() || null,
      before_counts: before.reset_sensitive_counts,
      after_counts: mid.reset_sensitive_counts,
      flagship_sold_before: before.flagship.sold,
      flagship_sold_after: mid.flagship.sold,
    })],
  );
  const afterPreview = await previewPrelaunchReset(client);
  if (afterPreview.reset_audit_count !== 1) throw conflict("Reset audit was not created exactly once", "audit_missing");
  return {
    ok: true as const,
    mode: "executed" as const,
    reset_version: RESET_VERSION,
    audit_id: auditId,
    already_clean: false as const,
    before,
    after: {
      ...afterPreview,
      admin_members: afterPreview.preserved_admins.length,
      non_admin_members: afterPreview.non_admin_members.length,
      flagship_sold: afterPreview.flagship.sold,
    },
  };
}
