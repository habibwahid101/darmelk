import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "backend/package.json"));
const esbuild = require("esbuild");
const read = (rel) => readFileSync(join(root, rel), "utf8");

async function loadFoundation() {
  const dir = mkdtempSync(join(tmpdir(), "darmelk-fdn-"));
  const outfile = join(dir, "foundation.mjs");
  await esbuild.build({
    stdin: {
      contents: `export * from ${JSON.stringify(join(root, "backend/src/engine/foundation.ts"))};`,
      resolveDir: join(root, "backend/src"),
      sourcefile: "foundation-entry.ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    packages: "external",
    logLevel: "silent",
  });
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(dir, { recursive: true, force: true });
  return mod;
}

async function applyMigrations(db) {
  const files = readdirSync(join(root, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    await db.exec(readFileSync(join(root, "migrations", name), "utf8"));
  }
}

function sqlText(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function seedFoundation(foundation) {
  const db = new PGlite();
  await applyMigrations(db);
  const nodes = foundation.buildFoundationTree();
  const ids = new Map();
  nodes.forEach((node, index) => {
    ids.set(node.displayName, `fdn_${index}`);
  });
  const userValues = nodes
    .map((node, index) => {
      const id = ids.get(node.displayName);
      const email = foundation.foundationEmail(node.label);
      return `(${sqlText(id)}, ${sqlText(node.displayName)}, ${sqlText(email)}, true, now(), now())`;
    })
    .join(",\n");
  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
    ${userValues};
  `);
  const accountValues = nodes
    .map((node) => {
      const id = ids.get(node.displayName);
      return `(${sqlText(`acct_${id}`)}, ${sqlText(id)}, 'credential', ${sqlText(id)}, 'test-password', now(), now())`;
    })
    .join(",\n");
  await db.exec(`
    insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values
    ${accountValues};
  `);
  for (const [index, node] of nodes.entries()) {
    const id = ids.get(node.displayName);
    const parentId = node.parentLabel ? ids.get(nodes.find((n) => n.label === node.parentLabel).displayName) : null;
    const code = `DM-F${index.toString(16).toUpperCase().padStart(8, "0")}`;
    await db.query(
      `insert into members (
         user_id, referral_code, role, sponsor_user_id, network_parent_user_id, network_slot,
         onboarding_complete, activation_status, activation_expires_at
       ) values ($1, $2, 'member', $3, $4, $5, true, 'active', $6)`,
      [id, code, parentId, parentId, node.slot, foundation.FOUNDATION_ACTIVATION_EXPIRES_AT],
    );
  }
  return { db, ids };
}

function assertClean(validation) {
  assert.equal(validation.ok, true, validation.errors.join(" | "));
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.byLevel, { 0: 1, 1: 3, 2: 9, 3: 27, 4: 81 });
  assert.equal(validation.codes, 121);
  assert.equal(validation.credentials, 121);
  assert.deepEqual(validation.sampleAncestry, ["HW-2.3.1.2", "HW-2.3.1", "HW-2.3", "HW-2", "Habib Wahid-Root ID"]);
}

test("clean 121 foundation validation passes", async () => {
  const foundation = await loadFoundation();
  const { db } = await seedFoundation(foundation);
  const validation = await foundation.validateFoundation(db);
  assertClean(validation);
  assert.equal(validation.foundationBookings, 0);
  assert.equal(validation.foundationStandardActivationRows, 0);
  assert.deepEqual(validation.warnings, []);
  assert.equal(validation.active, 121);
});

test("a legitimate foundation booking does not fail foundation integrity", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  await db.exec(`
    insert into offers (slug, title, category, category_slug, retail_value, booking_amount, qualification_benefit, commission_eligible_amount, summary)
    values ('share', 'Share', 'stay', 'stay', 100000, 50000, 50000, 50000, '');
  `);
  await db.query(
    `insert into bookings (id, user_id, offer_slug, retail_value, booking_amount, qualification_benefit, commission_eligible_amount, status)
     values ('bk_fdn_1', $1, 'share', 100000, 50000, 50000, 50000, 'confirmed')`,
    [ids.get("HW-1")],
  );
  const validation = await foundation.validateFoundation(db);
  assertClean(validation);
  assert.equal(validation.foundationBookings, 1);
  assert.equal(validation.foundationStandardActivationRows, 0);
  assert.deepEqual(validation.warnings, []);
  assert.equal(validation.errors.some((error) => /booking/i.test(error)), false);
});

test("foundation commission history does not fail foundation integrity", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  await db.exec(`
    insert into offers (slug, title, category, category_slug, retail_value, booking_amount, qualification_benefit, commission_eligible_amount, summary)
    values ('share', 'Share', 'stay', 'stay', 100000, 50000, 50000, 50000, '');
  `);
  await db.query(
    `insert into bookings (id, user_id, offer_slug, retail_value, booking_amount, qualification_benefit, commission_eligible_amount, status)
     values ('bk_fdn_1', $1, 'share', 100000, 50000, 50000, 50000, 'confirmed')`,
    [ids.get("HW-1")],
  );
  await db.query(
    `insert into commission_ledger (
       id, beneficiary_user_id, source_booking_id, source_user_id, level, rate,
       source_booking_amount, amount, status
     ) values ('cml_fdn_1', $1, 'bk_fdn_1', $2, 1, 0.100, 50000, 5000, 'available')`,
    [ids.get("Habib Wahid-Root ID"), ids.get("HW-1")],
  );
  const validation = await foundation.validateFoundation(db);
  assertClean(validation);
  assert.equal(validation.foundationBookings, 1);
  assert.deepEqual(validation.errors, []);
});

test("historical BDT 1000 foundation activation rows are warnings only", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  await db.query(
    `insert into annual_activations (id, user_id, amount, period_start, period_end, status)
     values ('act_fdn_hist', $1, 1000, now(), now() + interval '1 year', 'rejected')`,
    [ids.get("HW-2")],
  );
  const validation = await foundation.validateFoundation(db);
  assertClean(validation);
  assert.equal(validation.foundationStandardActivationRows, 1);
  assert.equal(validation.warnings.length, 1);
  assert.match(validation.warnings[0], /historical BDT 1000 annual activation row/);
  assert.match(validation.warnings[0], /Diagnostic only/);
  assert.equal(validation.errors.some((error) => /1000|activation payment|fake/i.test(error)), false);
});

test("wrong foundation sentinel fails validation", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  await db.query(`update members set activation_expires_at = '2027-01-01T00:00:00.000Z' where user_id = $1`, [
    ids.get("HW-3"),
  ]);
  const validation = await foundation.validateFoundation(db);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.includes("expiry is not the foundation sentinel")), true);
});

test("missing foundation credential fails validation", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  await db.query(`update account set password = null where "userId" = $1`, [ids.get("HW-1")]);
  const validation = await foundation.validateFoundation(db);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /credential accounts 120\/121/);
});

test("sponsor and network parent mismatch fails validation", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  await db.query(`update members set sponsor_user_id = $1 where user_id = $2`, [
    ids.get("Habib Wahid-Root ID"),
    ids.get("HW-1.1"),
  ]);
  const validation = await foundation.validateFoundation(db);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.includes("HW-1.1 sponsor/matrix parent mismatch")), true);
});

test("wrong foundation level count fails validation", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  await db.query(`update "user" set name = 'Not A Foundation Label' where id = $1`, [ids.get("HW-1.1.1.1")]);
  const validation = await foundation.validateFoundation(db);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.includes("level 4 count 80")), true);
  assert.equal(validation.errors.some((error) => error.includes("foundation count 120")), true);
});

test("duplicate foundation referral code fails validation", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  const constraints = await db.query(
    `select conname from pg_constraint where conrelid = 'members'::regclass and contype = 'u'`,
  );
  const referralConstraint = constraints.rows.map((row) => row.conname).find((name) => name.includes("referral"));
  assert.ok(referralConstraint);
  await db.exec(`alter table members drop constraint ${referralConstraint}`);
  const code = await db.query(`select referral_code from members where user_id = $1`, [ids.get("HW-1")]);
  await db.query(`update members set referral_code = $1 where user_id = $2`, [code.rows[0].referral_code, ids.get("HW-2")]);
  const validation = await foundation.validateFoundation(db);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.startsWith("duplicate referral code ")), true);
});

test("corrupted foundation ancestry fails validation", async () => {
  const foundation = await loadFoundation();
  const { db, ids } = await seedFoundation(foundation);
  await db.query(
    `update members
        set network_parent_user_id = $1, sponsor_user_id = $1, network_slot = null
      where user_id = $2`,
    [ids.get("Habib Wahid-Root ID"), ids.get("HW-2.3.1.2")],
  );
  const validation = await foundation.validateFoundation(db);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.startsWith("HW-2.3.1.2 ancestry ")), true);
});
