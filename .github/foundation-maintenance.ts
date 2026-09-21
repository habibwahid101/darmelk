import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getPool } from "./db.ts";
import { soldForOffer } from "./engine/inventory.ts";
import {
  assessCleanFoundationPreconditions,
  assertTreeShape,
  buildFoundationTree,
  createFoundationNetwork,
  FOUNDATION_LEVEL_COUNTS,
  FOUNDATION_ROOT_LABEL,
  FOUNDATION_SITE_ORIGIN,
  FOUNDATION_TOTAL,
  foundationEmail,
  inspectResetScope,
  isProductionDatabaseUrl,
  referralLinkFor,
  validateFoundation,
} from "./engine/foundation.ts";

type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

type MaintenanceEvent = {
  action?: string;
  mode?: "inspect" | "execute";
  confirmReset?: boolean;
  confirmProduction?: boolean;
  forceRebuild?: boolean;
};

async function countOrZero(client: PgClient, sql: string, params: unknown[] = []): Promise<number> {
  try {
    const { rows } = await client.query(sql, params);
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
    if (code === "42P01" || code === "42703") return 0;
    throw err;
  }
}

function plannedTree() {
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
  return {
    nodes,
    plannedEmails,
    uniqueLoginIdentities: emailSet.size,
    uniqueLabels: labelSet.size,
    ancestryOk,
    slotUniquenessOk: [...slotsByParent.values()].every((s) => s.size === 3) && ancestryOk,
  };
}

async function extraCounts(client: PgClient) {
  return {
    bookings: await countOrZero(client, `select count(*)::int as count from bookings`),
    network_positions: await countOrZero(
      client,
      `select count(*)::int as count from members where network_parent_user_id is not null or network_slot is not null`,
    ),
    activations: await countOrZero(client, `select count(*)::int as count from annual_activations`),
    commissions: await countOrZero(client, `select count(*)::int as count from commission_ledger`),
    withdrawals: await countOrZero(client, `select count(*)::int as count from withdrawals`),
    payment_submissions: await countOrZero(client, `select count(*)::int as count from payment_submissions`),
    promotions: await countOrZero(client, `select count(*)::int as count from promotion_qualifications`),
    leadership: await countOrZero(client, `select count(*)::int as count from leadership_reward_cycles`),
    inventory_events: await countOrZero(client, `select count(*)::int as count from offer_inventory_events`),
    foundation_emails: await countOrZero(
      client,
      `select count(*)::int as count from "user" where email ilike '%@foundation.darmelk.invalid'`,
    ),
    foundation_names: await countOrZero(
      client,
      `select count(*)::int as count from "user" where name = $1 or name ~ '^HW-[0-9]'`,
      [FOUNDATION_ROOT_LABEL],
    ),
    dup_emails: await countOrZero(
      client,
      `select count(*)::int as count from (select email from "user" group by email having count(*) > 1) d`,
    ),
    dup_codes: await countOrZero(
      client,
      `select count(*)::int as count from (select referral_code from members group by referral_code having count(*) > 1) d`,
    ),
    duplicate_slots: await countOrZero(
      client,
      `select count(*)::int as count from (
         select network_parent_user_id, network_slot
           from members
          where network_parent_user_id is not null and network_slot is not null
          group by network_parent_user_id, network_slot
         having count(*) > 1
       ) d`,
    ),
    members_total: await countOrZero(client, `select count(*)::int as count from members`),
    users_total: await countOrZero(client, `select count(*)::int as count from "user"`),
    credential_accounts: await countOrZero(
      client,
      `select count(*)::int as count from "account" where "providerId" = 'credential' and password is not null`,
    ),
  };
}

function classify(foundationCount: number, validationOk: boolean | null): "NOT_EXECUTED" | "EXECUTED_SUCCESSFULLY" | "PARTIAL_OR_CORRUPT" {
  if (foundationCount === 0) return "NOT_EXECUTED";
  if (foundationCount === FOUNDATION_TOTAL && validationOk === true) return "EXECUTED_SUCCESSFULLY";
  return "PARTIAL_OR_CORRUPT";
}

async function inspectWithClient(client: PgClient) {
  const tree = plannedTree();
  const hashed = await hashPassword("HW@2026#Common");
  const passwordHashPathPass = typeof hashed === "string" && hashed.length > 20 && !hashed.includes("HW@2026");
  const scope = await inspectResetScope(client as never);
  const extra = await extraCounts(client);
  const flagshipSold = await soldForOffer(client as never, "five-star-hotel-share");
  const conflicts = await client.query(
    `select email from "user" where email = any($1::text[]) order by email`,
    [tree.plannedEmails],
  );
  const codeConflicts = await client.query(
    `select m.referral_code
       from members m
       join "user" u on u.id = m.user_id
      where u.name = $1 or u.name ~ '^HW-[0-9]'
      group by m.referral_code
     having count(*) > 1`,
    [FOUNDATION_ROOT_LABEL],
  );
  const clean = assessCleanFoundationPreconditions(scope);
  let validation = null;
  if (scope.foundationExisting > 0) {
    validation = await validateFoundation(client as never);
  }
  const state = classify(scope.foundationExisting, validation ? validation.ok : null);
  const unexpected =
    extra.bookings > 0 ||
    extra.network_positions > 0 ||
    extra.activations > 0 ||
    extra.commissions > 0 ||
    extra.withdrawals > 0 ||
    extra.payment_submissions > 0 ||
    extra.promotions > 0 ||
    extra.leadership > 0 ||
    extra.inventory_events > 0 ||
    extra.dup_emails > 0 ||
    extra.dup_codes > 0 ||
    extra.duplicate_slots > 0 ||
    flagshipSold > 0 ||
    conflicts.rows.length > 0 ||
    codeConflicts.rows.length > 0 ||
    !clean.ok;
  const uniqueUrls = validation?.codes ?? tree.uniqueLoginIdentities;
  return {
    ok: true,
    dryRun: true,
    action: "inspect — nothing modified",
    productionDetected: isProductionDatabaseUrl(process.env.DATABASE_URL?.trim() ?? ""),
    productionWritesPerformed: false,
    passwordLogged: false,
    passwordHashPathPass,
    expected: {
      root: FOUNDATION_LEVEL_COUNTS[0],
      level1: FOUNDATION_LEVEL_COUNTS[1],
      level2: FOUNDATION_LEVEL_COUNTS[2],
      level3: FOUNDATION_LEVEL_COUNTS[3],
      level4: FOUNDATION_LEVEL_COUNTS[4],
      total: FOUNDATION_TOTAL,
    },
    planned: {
      uniqueLoginIdentities: tree.uniqueLoginIdentities,
      uniqueLabels: tree.uniqueLabels,
      uniqueReferralUrls: FOUNDATION_TOTAL,
      ancestryOk: tree.ancestryOk,
      slotUniquenessOk: tree.slotUniquenessOk,
      level5Leaves: FOUNDATION_LEVEL_COUNTS[4],
    },
    sampleReferralLink: referralLinkFor("DM-EXAMPLE", FOUNDATION_SITE_ORIGIN),
    commissionRates: { 1: 0.1, 2: 0.08, 3: 0.06, 4: 0.04, 5: 0.02 },
    adminCount: scope.admins.length,
    adminEmails: scope.admins.map((a) => a.email),
    nonAdminMembers: scope.nonAdminCount,
    existingFoundationAccounts: scope.foundationExisting,
    orphanAuthUsers: scope.orphanAuthUsers,
    flagshipPresent: scope.flagshipPresent,
    catalogOfferCount: scope.catalogOfferCount,
    migrationCount: scope.migrationCount,
    extra,
    flagshipSold,
    conflictingPlannedEmails: conflicts.rows.map((r) => String(r.email)),
    conflictingReferralCodes: codeConflicts.rows.map((r) => String(r.referral_code)),
    cleanPrecondition: clean,
    dbState: state,
    validation,
    uniqueLoginIdentitiesLive: extra.foundation_emails,
    uniqueReferralCodesLive: validation?.codes ?? 0,
    uniqueReferralUrlsLive: uniqueUrls,
    credentialAccountsLive: validation?.credentials ?? 0,
    activeFoundationLive: validation?.active ?? 0,
    commissionEligibleLive: validation?.commissionEligible ?? 0,
    safeToExecute: state === "NOT_EXECUTED" && !unexpected && tree.ancestryOk && tree.slotUniquenessOk && passwordHashPathPass,
    deletesDataOnExecute: false,
    forceRebuildRefused: true,
  };
}

async function inspectOnly() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    const report = await inspectWithClient(client);
    await client.query("ROLLBACK");
    return report;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function extraFoundationSideEffects(client: PgClient) {
  return {
    foundation_bookings: await countOrZero(
      client,
      `select count(*)::int as count from bookings b
         join "user" u on u.id = b.user_id
        where u.name = $1 or u.name ~ '^HW-[0-9]'`,
      [FOUNDATION_ROOT_LABEL],
    ),
    foundation_commissions: await countOrZero(
      client,
      `select count(*)::int as count from commission_ledger c
         join "user" u on u.id = c.beneficiary_user_id or u.id = c.source_user_id
        where u.name = $1 or u.name ~ '^HW-[0-9]'`,
      [FOUNDATION_ROOT_LABEL],
    ),
    foundation_inventory: await countOrZero(
      client,
      `select count(*)::int as count from offer_inventory_events e
         join bookings b on b.id = e.booking_id
         join "user" u on u.id = b.user_id
        where u.name = $1 or u.name ~ '^HW-[0-9]'`,
      [FOUNDATION_ROOT_LABEL],
    ),
    foundation_promotions: await countOrZero(
      client,
      `select count(*)::int as count from promotion_qualifications q
         join "user" u on u.id = q.user_id
        where u.name = $1 or u.name ~ '^HW-[0-9]'`,
      [FOUNDATION_ROOT_LABEL],
    ),
    foundation_leadership: await countOrZero(
      client,
      `select count(*)::int as count from leadership_reward_cycles l
         join "user" u on u.id = l.user_id
        where u.name = $1 or u.name ~ '^HW-[0-9]'`,
      [FOUNDATION_ROOT_LABEL],
    ),
    foundation_activations: await countOrZero(
      client,
      `select count(*)::int as count from annual_activations a
         join "user" u on u.id = a.user_id
        where u.name = $1 or u.name ~ '^HW-[0-9]'`,
      [FOUNDATION_ROOT_LABEL],
    ),
  };
}

async function executeOnly() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`LOCK TABLE members, "user", account IN SHARE ROW EXCLUSIVE MODE`);
    const before = await inspectWithClient(client);
    if (before.dbState === "EXECUTED_SUCCESSFULLY") {
      await client.query("ROLLBACK");
      return {
        ok: true,
        aborted: false,
        executionRequired: false,
        action: "already-exists — no writes",
        productionWritesPerformed: false,
        passwordLogged: false,
        inspect: before,
      };
    }
    if (before.dbState === "PARTIAL_OR_CORRUPT") {
      await client.query("ROLLBACK");
      return {
        ok: false,
        aborted: true,
        executionRequired: false,
        action: "aborted — partial or corrupt foundation",
        productionWritesPerformed: false,
        passwordLogged: false,
        inspect: before,
      };
    }
    if (!before.safeToExecute) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        aborted: true,
        executionRequired: true,
        action: "aborted — preconditions failed",
        productionWritesPerformed: false,
        passwordLogged: false,
        inspect: before,
      };
    }
    const actor = before.adminEmails.length ? (await client.query(
      `select m.user_id from members m join "user" u on u.id = m.user_id where m.role = 'admin' order by u.email limit 1`,
    )).rows[0]?.user_id as string | undefined : undefined;
    const created = await createFoundationNetwork(client as never, {
      actorUserId: actor ?? null,
      runId: randomUUID(),
    });
    const validation = await validateFoundation(client as never);
    const side = await extraFoundationSideEffects(client);
    const flagshipSold = await soldForOffer(client as never, "five-star-hotel-share");
    const adminCount = await countOrZero(client, `select count(*)::int as count from members where role = 'admin'`);
    const catalog = await countOrZero(client, `select count(*)::int as count from offers`);
    const flagshipPresent = (await countOrZero(client, `select count(*)::int as count from offers where slug = 'five-star-hotel-share'`)) > 0;
    const errors = [...(validation.ok ? [] : validation.errors)];
    if (created.created !== FOUNDATION_TOTAL) errors.push(`created ${created.created}`);
    if (created.byLevel[0] !== 1 || created.byLevel[1] !== 3 || created.byLevel[2] !== 9 || created.byLevel[3] !== 27 || created.byLevel[4] !== 81) {
      errors.push(`level counts ${JSON.stringify(created.byLevel)}`);
    }
    if (side.foundation_bookings !== 0) errors.push("foundation bookings created");
    if (side.foundation_commissions !== 0) errors.push("foundation commissions created");
    if (side.foundation_inventory !== 0) errors.push("foundation inventory events created");
    if (side.foundation_promotions !== 0) errors.push("foundation promotions created");
    if (side.foundation_leadership !== 0) errors.push("foundation leadership created");
    if (side.foundation_activations !== 0) errors.push("foundation activation payments created");
    if (flagshipSold !== 0) errors.push(`flagship sold ${flagshipSold}`);
    if (adminCount < 1) errors.push("admin missing after create");
    if (!flagshipPresent || catalog < 1) errors.push("catalog/flagship missing after create");
    if (errors.length > 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        aborted: true,
        executionRequired: true,
        action: "rolled-back — validation failed",
        productionWritesPerformed: false,
        passwordLogged: false,
        errors,
        inspect: before,
        created,
        validation,
        side,
      };
    }
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      aborted: true,
      executionRequired: true,
      action: "rolled-back — exception",
      productionWritesPerformed: false,
      passwordLogged: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    client.release();
  }

  const verify = await inspectOnly();
  return {
    ok: verify.dbState === "EXECUTED_SUCCESSFULLY" && verify.validation?.ok === true,
    aborted: false,
    executionRequired: true,
    action: "foundation-setup committed",
    productionWritesPerformed: true,
    passwordLogged: false,
    postInspect: verify,
  };
}

export async function handler(event: MaintenanceEvent = {}) {
  const action = event.action ?? "";
  const mode = event.mode ?? (action === "foundation-execute" ? "execute" : "inspect");
  if (mode === "execute" || action === "foundation-execute") {
    if (event.forceRebuild === true) {
      return {
        ok: false,
        aborted: true,
        action: "refused — force-rebuild is not allowed",
        productionWritesPerformed: false,
        passwordLogged: false,
      };
    }
    if (event.confirmReset !== true || event.confirmProduction !== true) {
      return {
        ok: false,
        aborted: true,
        action: "refused — execute requires confirmReset and confirmProduction",
        productionWritesPerformed: false,
        passwordLogged: false,
      };
    }
    return executeOnly();
  }
  return inspectOnly();
}
