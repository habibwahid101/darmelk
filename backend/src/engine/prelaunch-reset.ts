import type { PoolClient } from "pg";
import { deriveInventory, soldForOffer } from "./inventory.js";

export const FLAGSHIP_SLUG = "five-star-hotel-share";

export const RESET_SENSITIVE_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "members",
  "bookings",
  "booking_snapshots",
  "idempotency_keys",
  "commission_ledger",
  "reversal_entries",
  "withdrawals",
  "annual_activations",
  "admin_actions",
  "payment_submissions",
  "payout_methods",
  "commission_payout_allocations",
  "contact_requests",
  "leadership_reward_cycles",
  "leadership_reward_tier_events",
  "leadership_reward_entitlements",
  "merchants",
  "merchant_bundle_purchases",
  "merchant_payment_requests",
  "merchant_credit_ledger",
  "merchant_gift_fulfillments",
  "promotion_qualifications",
  "promotion_reward_fulfillments",
  "promotion_reward_events",
  "offer_inventory_events",
  "user_consents",
] as const;

export const PRESERVE_CATALOG_TABLES = [
  "_migrations",
  "offers",
  "offer_media",
  "jobs",
  "merchant_bundles",
  "promotions",
  "promotion_offers",
  "promotion_rewards",
] as const;

const LEDGER_NOTICE =
  "commission/reversal/withdrawal/admin_action history, booking snapshots, inventory events, and financial/payment history are normally append-only. This preview describes a ONE-TIME PRELAUNCH CLEAN RESET, not normal production behavior. No reset execution is authorized.";

export function maskEmail(email: string): string {
  const trimmed = (email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function quoted(table: string): string {
  return `"${table.replaceAll('"', "")}"`;
}

async function countTable(client: PoolClient, table: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from ${quoted(table)}`);
  return rows[0]?.n ?? 0;
}

export type PrelaunchResetPreview = {
  ok: true;
  mode: "preview";
  execution_authorized: false;
  destructive_endpoint: false;
  ledger_notice: string;
  preserved_admins: Array<{
    user_id: string;
    masked_email: string;
    role: string;
    referral_code: string;
    activation_status: string;
    sponsor_user_id: string | null;
    network_parent_user_id: string | null;
    network_slot: number | null;
    points_to_non_admin: boolean;
    auth_user_present: boolean;
    account_rows: number;
    session_rows: number;
  }>;
  reset_sensitive_counts: Record<string, number>;
  preserve_catalog_counts: Record<string, number>;
  flagship: {
    slug: string;
    total_quantity: number | null;
    consume_events: number;
    binding_bookings: number;
    booking_statuses: Record<string, number>;
    sold: number;
    reserved: number | null;
    available: number | null;
  };
  non_admin_members: Array<{
    user_id: string;
    masked_email: string;
    created_at: string;
    role: string;
    activation_status: string;
    booking_count: number;
  }>;
};

export async function previewPrelaunchReset(client: PoolClient): Promise<PrelaunchResetPreview> {
  const reset_sensitive_counts: Record<string, number> = {};
  for (const table of RESET_SENSITIVE_TABLES) {
    reset_sensitive_counts[table] = await countTable(client, table);
  }
  const preserve_catalog_counts: Record<string, number> = {};
  for (const table of PRESERVE_CATALOG_TABLES) {
    preserve_catalog_counts[table] = await countTable(client, table);
  }

  const { rows: adminRows } = await client.query<{
    user_id: string;
    email: string | null;
    role: string;
    referral_code: string;
    activation_status: string;
    sponsor_user_id: string | null;
    network_parent_user_id: string | null;
    network_slot: number | null;
    auth_user_present: boolean;
    account_rows: number;
    session_rows: number;
  }>(
    `select
        m.user_id,
        u.email,
        m.role,
        m.referral_code,
        m.activation_status,
        m.sponsor_user_id,
        m.network_parent_user_id,
        m.network_slot,
        (u.id is not null) as auth_user_present,
        (select count(*)::int from "account" a where a."userId" = m.user_id) as account_rows,
        (select count(*)::int from "session" s where s."userId" = m.user_id) as session_rows
       from members m
       left join "user" u on u.id = m.user_id
      where m.role = 'admin'
      order by m.created_at asc`,
  );

  const nonAdminIds = new Set(
    (
      await client.query<{ user_id: string }>(`select user_id from members where role <> 'admin'`)
    ).rows.map((row) => row.user_id),
  );

  const preserved_admins = adminRows.map((row) => {
    const sponsorNonAdmin = Boolean(row.sponsor_user_id && nonAdminIds.has(row.sponsor_user_id));
    const parentNonAdmin = Boolean(row.network_parent_user_id && nonAdminIds.has(row.network_parent_user_id));
    return {
      user_id: row.user_id,
      masked_email: maskEmail(row.email ?? ""),
      role: row.role,
      referral_code: row.referral_code,
      activation_status: row.activation_status,
      sponsor_user_id: row.sponsor_user_id,
      network_parent_user_id: row.network_parent_user_id,
      network_slot: row.network_slot,
      points_to_non_admin: sponsorNonAdmin || parentNonAdmin,
      auth_user_present: row.auth_user_present,
      account_rows: row.account_rows,
      session_rows: row.session_rows,
    };
  });

  const { rows: flagshipOffer } = await client.query<{ total_quantity: number | null }>(
    `select total_quantity from offers where slug = $1`,
    [FLAGSHIP_SLUG],
  );
  const { rows: consumeRows } = await client.query<{ n: number }>(
    `select count(*)::int as n from offer_inventory_events
      where offer_slug = $1 and event_type = 'consume'`,
    [FLAGSHIP_SLUG],
  );
  const { rows: bindingRows } = await client.query<{ n: number }>(
    `select count(*)::int as n from bookings
      where offer_slug = $1 and status in ('confirmed', 'activated', 'reversed')`,
    [FLAGSHIP_SLUG],
  );
  const { rows: statusRows } = await client.query<{ status: string; n: number }>(
    `select status, count(*)::int as n from bookings
      where offer_slug = $1 group by status order by status`,
    [FLAGSHIP_SLUG],
  );
  const booking_statuses: Record<string, number> = {};
  for (const row of statusRows) booking_statuses[row.status] = row.n;
  const sold = await soldForOffer(client, FLAGSHIP_SLUG);
  const inventory = deriveInventory(flagshipOffer[0]?.total_quantity ?? null, sold);

  const { rows: nonAdminRows } = await client.query<{
    user_id: string;
    email: string | null;
    created_at: string;
    role: string;
    activation_status: string;
    booking_count: number;
  }>(
    `select
        m.user_id,
        u.email,
        m.created_at,
        m.role,
        m.activation_status,
        (select count(*)::int from bookings b where b.user_id = m.user_id) as booking_count
       from members m
       left join "user" u on u.id = m.user_id
      where m.role <> 'admin'
      order by m.created_at asc`,
  );

  return {
    ok: true,
    mode: "preview",
    execution_authorized: false,
    destructive_endpoint: false,
    ledger_notice: LEDGER_NOTICE,
    preserved_admins,
    reset_sensitive_counts,
    preserve_catalog_counts,
    flagship: {
      slug: FLAGSHIP_SLUG,
      total_quantity: flagshipOffer[0]?.total_quantity ?? null,
      consume_events: consumeRows[0]?.n ?? 0,
      binding_bookings: bindingRows[0]?.n ?? 0,
      booking_statuses,
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
  };
}
