import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { sslOption } from "./db.ts";
import {
  assessCleanFoundationPreconditions,
  assertTreeShape,
  buildFoundationTree,
  createFoundationNetwork,
  deleteNonAdminMembers,
  FOUNDATION_LEVEL_COUNTS,
  FOUNDATION_ROOT_LABEL,
  FOUNDATION_SITE_ORIGIN,
  FOUNDATION_TOTAL,
  inspectResetScope,
  isProductionDatabaseUrl,
  referralLinkFor,
  validateFoundation,
} from "./engine/foundation.ts";

function arg(flag: string): boolean {
  return process.argv.includes(flag);
}

function flagValue(name: string): string | undefined {
  const exact = process.argv.findIndex((a) => a === `--${name}`);
  if (exact >= 0) {
    const next = process.argv[exact + 1];
    if (next && !next.startsWith("-")) return next;
    return "";
  }
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function assertFixedBootstrapShape(): void {
  const branching = flagValue("branching");
  const depth = flagValue("depth");
  const root = flagValue("root");
  if (branching !== undefined && branching !== "" && branching !== "3") {
    throw new Error("This bootstrap is fixed at --branching=3. Refusing a different tree shape.");
  }
  if (depth !== undefined && depth !== "" && depth !== "4") {
    throw new Error("This bootstrap is fixed at --depth=4. Refusing a different tree shape.");
  }
  if (root !== undefined && root !== "" && root !== FOUNDATION_ROOT_LABEL) {
    throw new Error(`This bootstrap is fixed at --root="${FOUNDATION_ROOT_LABEL}".`);
  }
}

function dbTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  assertFixedBootstrapShape();
  const dryRun = arg("--dry-run") || !arg("--confirm-reset");
  const confirmReset = arg("--confirm-reset");
  const confirmProduction = arg("--confirm-production");
  const nodes = buildFoundationTree();
  assertTreeShape(nodes);

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const report: Record<string, unknown> = {
    environment: process.env.NODE_ENV ?? "development",
    dryRun,
    command: {
      dryRun: "npm run darmelk -- --dry-run",
      execute: "npm run darmelk -- --confirm-reset",
      executeProduction: "npm run darmelk -- --confirm-reset --confirm-production",
    },
    expected: {
      root: FOUNDATION_LEVEL_COUNTS[0],
      level1: FOUNDATION_LEVEL_COUNTS[1],
      level2: FOUNDATION_LEVEL_COUNTS[2],
      level3: FOUNDATION_LEVEL_COUNTS[3],
      level4: FOUNDATION_LEVEL_COUNTS[4],
      total: FOUNDATION_TOTAL,
      wallets: FOUNDATION_TOTAL,
      referralCodes: FOUNDATION_TOTAL,
      referralLinks: FOUNDATION_TOTAL,
      activationFee: 0,
      walletModel: "commission_ledger by beneficiary_user_id; opening balance 0; no separate wallet table",
    },
    sampleReferralLink: referralLinkFor("DM-EXAMPLE", FOUNDATION_SITE_ORIGIN),
    initialPasswordConfigured: true,
    passwordLogged: false,
  };

  if (!databaseUrl) {
    report.database = "DATABASE_URL not set — structure-only dry-run";
    report.adminsPreserved = "unknown (no database)";
    report.nonAdminUsersWouldBeDeleted = "unknown (no database)";
    report.backupSnapshot = "unavailable in this environment";
    console.log(JSON.stringify(report, null, 2));
    if (confirmReset) {
      console.error("Refusing --confirm-reset without DATABASE_URL");
      process.exit(1);
    }
    return;
  }

  report.database = dbTarget(databaseUrl);
  report.productionDetected = isProductionDatabaseUrl(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl, ssl: sslOption(), max: 2 });
  const client = await pool.connect();
  try {
    const scope = await inspectResetScope(client);
    const clean = assessCleanFoundationPreconditions(scope);
    report.adminsPreserved = scope.admins.map((a) => a.email);
    report.adminCount = scope.admins.length;
    report.nonAdminMembers = scope.nonAdminCount;
    report.existingFoundationAccounts = scope.foundationExisting;
    report.orphanAuthUsers = scope.orphanAuthUsers;
    report.flagshipPresent = scope.flagshipPresent;
    report.catalogOfferCount = scope.catalogOfferCount;
    report.migrationCount = scope.migrationCount;
    report.dependentRecordsOnNonAdmins = scope.dependentRecords;
    report.cleanPrecondition = clean;
    report.deletesDataOnExecute = false;
    report.nonAdminUsersWouldBeDeleted = 0;
    report.backupSnapshot = isProductionDatabaseUrl(databaseUrl)
      ? "NOT VERIFIED in this CLI — require a current RDS automated backup/PITR before --confirm-production"
      : "non-production target";

    if (dryRun || !confirmReset) {
      report.action = "dry-run — nothing modified";
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (isProductionDatabaseUrl(databaseUrl) && !confirmProduction) {
      console.error("Production database detected. Pass --confirm-production in addition to --confirm-reset.");
      process.exit(1);
    }

    if (scope.admins.length === 0) {
      console.error("No admin members found. Refusing to reset.");
      process.exit(1);
    }

    const forceRebuild = arg("--force-rebuild");
    if (scope.foundationExisting === FOUNDATION_TOTAL && !forceRebuild) {
      const existing = await validateFoundation(client);
      if (existing.ok) {
        report.action = "FOUNDATION NETWORK ALREADY EXISTS — VALIDATION PASSED";
        report.validation = existing;
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      console.error("Partial or corrupt foundation detected:", existing.errors);
      console.error("Do not use --force-rebuild unless that corrupt state is proven after a failed execution.");
      process.exit(1);
    }

    if (scope.foundationExisting > 0 && scope.foundationExisting !== FOUNDATION_TOTAL && !forceRebuild) {
      console.error(
        `Partial foundation detected (${scope.foundationExisting}/${FOUNDATION_TOTAL}). Refusing to create more accounts.`,
      );
      console.error("Do not use --force-rebuild unless that partial state is proven after a failed execution.");
      process.exit(1);
    }

    if (!forceRebuild && !clean.ok) {
      console.error("Clean-production precondition failed:", clean.errors.join("; "));
      console.error("Foundation setup will not delete production data. Resolve contamination first.");
      process.exit(1);
    }

    await client.query("BEGIN");
    let removed = 0;
    if (forceRebuild) {
      removed = await deleteNonAdminMembers(client);
    }
    const actor = scope.admins[0]?.user_id ?? null;
    const created = await createFoundationNetwork(client, { actorUserId: actor, runId: randomUUID() });
    const validation = await validateFoundation(client);
    if (!validation.ok) {
      await client.query("ROLLBACK");
      console.error("Validation failed, rolled back:", validation.errors);
      process.exit(1);
    }
    await client.query("COMMIT");
    report.action = forceRebuild ? "force-rebuild committed" : "foundation-setup committed";
    report.legacyNonAdminRemoved = removed;
    report.created = created.created;
    report.byLevel = created.byLevel;
    report.validation = validation;
    report.referralLinkExample = referralLinkFor(created.referralCodes[created.referralCodes.length - 1] ?? "");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
