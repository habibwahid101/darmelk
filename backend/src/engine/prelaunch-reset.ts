import type { PoolClient } from "pg";
import { badRequest, conflict, forbidden } from "../errors.js";
import { uid } from "../ids.js";
import { deriveInventory, soldForOffer } from "./inventory.js";

export const FLAGSHIP_SLUG = "five-star-hotel-share";
export const RESET_CONFIRMATION = "RESET DARMELK PRELAUNCH DATA";
export const RESET_VERSION = "prelaunch-reset-v1";
export const RESET_ACTION_TYPE = "ONE_TIME_PRELAUNCH_RESET";

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

export const CLEAR_TRANSACTION_TABLES = [
  "verification",
  "promotion_reward_events",
  "promotion_reward_fulfillments",
  "promotion_qualifications",
  "offer_inventory_events",
  "user_consents",
  "merchant_gift_fulfillments",
  "merchant_credit_ledger",
  "merchant_payment_requests",
  "merchant_bundle_purchases",
  "merchants",
  "leadership_reward_entitlements",
  "leadership_reward_tier_events",
  "leadership_reward_cycles",
  "commission_payout_allocations",
  "reversal_entries",
  "payment_submissions",
  "booking_snapshots",
  "commission_ledger",
  "withdrawals",
  "annual_activations",
  "bookings",
  "payout_methods",
  "contact_requests",
  "idempotency_keys",
] as const;

const LEDGER_NOTICE =
  "commission/reversal/withdrawal/admin_action history, booking snapshots, inventory events, and financial/payment history are normally append-only. This preview describes a ONE-TIME PRELAUNCH CLEAN RESET, not normal production behavior.";

export function maskEmail(email: string): string {
  const trimmed = (email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function quoted(table: string): string {
  return `"${table.replaceAll('"', "")}"`;
}

export async function countTable(client: PoolClient, table: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from ${quoted(table)}`);
  return rows[0]?.n ?? 0;
}

export function isProductionDarmelk(): boolean {
  const url = (process.env.BETTER_AUTH_URL ?? "").trim().toLowerCase().replace(/\/$/, "");
  return url === "https://darmelk.com" || url === "https://www.darmelk.com" || url === "https://api.darmelk.com";
}

export function isCiResetHarness(): boolean {
  return process.env.DARMELK_PRELAUNCH_RESET_TEST === "1" && (process.env.DATABASE_URL ?? "").includes("darmelk_ci");
}

export function assertResetEnvironment(): void {
  if (isProductionDarmelk()) return;
  if (isCiResetHarness()) return;
  throw forbidden("Prelaunch reset is production Darmelk only", "not_production");
}
