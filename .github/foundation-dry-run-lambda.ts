import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { sslOption } from "./db.ts";
import { COMMISSION_RATES } from "./engine/commissions.ts";
import { soldForOffer } from "./engine/inventory.ts";
import {
  assessCleanFoundationPreconditions,
  assertTreeShape,
  buildFoundationTree,
  FOUNDATION_LEVEL_COUNTS,
  FOUNDATION_SITE_ORIGIN,
  FOUNDATION_TOTAL,
  foundationEmail,
  inspectResetScope,
  isProductionDatabaseUrl,
  referralLinkFor,
} from "./engine/foundation.ts";

async function countOrZero(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  try {
    const { rows } = await client.query(sql, params);
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
    if (code === "42P01" || code === "42703") return 0;
    throw err;
  }
}

export const handler = async () => {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  const nodes = buildFoundationTree();
  assertTreeShape(nodes);
  const plannedEmails = nodes.map((n) => foundationEmail(n.label));
  const emailSet = new Set(plannedEmails);
  const labelSet = new Set(nodes.map((n) => n.label));
  const slotsByParent = new Map<string, Set<number>>();
  let ancestryOk = true;
  for (const n of nodes) {
    if (n.parentLabel) {
      if (!labelSet.has(n.parentLabel)) ancestryOk = false;
      const slots = slotsByParent.get(n.parentLabel) ?? new Set();
      if (n.slot == null || slots.has(n.slot) || n.slot < 1 || n.slot > 3) ancestryOk = false;
      slots.add(n.slot ?? -1);
      slotsByParent.set(n.parentLabel, slots);
    } else if (n.level !== 0) {
      ancestryOk = false;
    }
  }
  const hashed = await hashPassword("HW@2026#Common");
  const passwordHashPathPass = typeof hashed === "string" && hashed.length > 20 && !hashed.includes("HW@2026");

  const pool = new Pool({ connectionString: databaseUrl, ssl: sslOption(), max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    const scope = await inspectResetScope(client);
    const extra = {
      bookings: await countOrZero(client, `select count(*)::int as count from bookings`),
      network_positions: await countOrZero(
        client,
        `select count(*)::int as count from members where network_parent_user_id is not null or network_slot is not null`,
      ),
      activations: await countOrZero(client, `select count(*)::int as count from annual_activations`),
      commissions: await countOrZero(client, `select count(*)::int as count from commission_ledger`),
      withdrawals: await countOrZero(client, `select count(*)::int as count from withdrawals`),
      promotions: await countOrZero(client, `select count(*)::int as count from promotion_qualifications`),
      leadership: await countOrZero(client, `select count(*)::int as count from leadership_reward_cycles`),
      foundation_emails: await countOrZero(
        client,
        `select count(*)::int as count from "user" where email ilike '%@foundation.darmelk.invalid'`,
      ),
      dup_emails: await countOrZero(
        client,
        `select count(*)::int as count from (select email from "user" group by email having count(*) > 1) d`,
      ),
      dup_codes: await countOrZero(
        client,
        `select count(*)::int as count from (select referral_code from members group by referral_code having count(*) > 1) d`,
      ),
    };
    const flagshipSold = await soldForOffer(client, "five-star-hotel-share");
    const conflicts = await client.query<{ email: string }>(
      `select email from "user" where email = any($1::text[]) order by email`,
      [plannedEmails],
    );
    await client.query("ROLLBACK");
    const clean = assessCleanFoundationPreconditions(scope);
    const unexpected =
      extra.bookings > 0 ||
      extra.network_positions > 0 ||
      extra.activations > 0 ||
      extra.commissions > 0 ||
      extra.withdrawals > 0 ||
      extra.promotions > 0 ||
      extra.leadership > 0 ||
      extra.foundation_emails > 0 ||
      extra.dup_emails > 0 ||
      extra.dup_codes > 0 ||
      flagshipSold > 0 ||
      conflicts.rows.length > 0 ||
      !clean.ok;
    return {
      ok: true,
      dryRun: true,
      action: "dry-run — nothing modified",
      productionDetected: isProductionDatabaseUrl(databaseUrl),
      productionWritesPerformed: false,
      expected: {
        root: FOUNDATION_LEVEL_COUNTS[0],
        level1: FOUNDATION_LEVEL_COUNTS[1],
        level2: FOUNDATION_LEVEL_COUNTS[2],
        level3: FOUNDATION_LEVEL_COUNTS[3],
        level4: FOUNDATION_LEVEL_COUNTS[4],
        total: FOUNDATION_TOTAL,
      },
      planned: {
        uniqueLoginIdentities: emailSet.size,
        uniqueLabels: labelSet.size,
        uniqueReferralUrls: FOUNDATION_TOTAL,
        ancestryOk,
        slotUniquenessOk: [...slotsByParent.values()].every((s) => s.size === 3) && ancestryOk,
        level5Leaves: FOUNDATION_LEVEL_COUNTS[4],
      },
      sampleReferralLink: referralLinkFor("DM-EXAMPLE", FOUNDATION_SITE_ORIGIN),
      initialPasswordConfigured: true,
      passwordLogged: false,
      passwordHashPathPass,
      commissionRates: COMMISSION_RATES,
      adminCount: scope.admins.length,
      adminEmails: scope.admins.map((a) => a.email),
      nonAdminMembers: scope.nonAdminCount,
      existingFoundationAccounts: scope.foundationExisting,
      orphanAuthUsers: scope.orphanAuthUsers,
      flagshipPresent: scope.flagshipPresent,
      catalogOfferCount: scope.catalogOfferCount,
      migrationCount: scope.migrationCount,
      dependentRecordsOnNonAdmins: scope.dependentRecords,
      extra,
      flagshipSold,
      conflictingPlannedEmails: conflicts.rows.map((r) => r.email),
      cleanPrecondition: clean,
      safeToExecute: !unexpected,
      deletesDataOnExecute: false,
    };
  } finally {
    client.release();
    await pool.end();
  }
};
