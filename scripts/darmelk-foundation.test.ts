import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("foundation tree is 1+3+9+27+81 = 121 with exact 3-wide ancestry", async () => {
  const { buildFoundationTree, assertTreeShape, FOUNDATION_TOTAL, foundationEmail, referralLinkFor } = await import(
    "../backend/src/engine/foundation.ts"
  );
  const nodes = buildFoundationTree();
  assertTreeShape(nodes);
  assert.equal(nodes.length, FOUNDATION_TOTAL);
  assert.equal(nodes.filter((n) => n.level === 0).length, 1);
  assert.equal(nodes.filter((n) => n.level === 1).length, 3);
  assert.equal(nodes.filter((n) => n.level === 2).length, 9);
  assert.equal(nodes.filter((n) => n.level === 3).length, 27);
  assert.equal(nodes.filter((n) => n.level === 4).length, 81);
  const sample = nodes.find((n) => n.displayName === "HW-2.3.1.2");
  assert.ok(sample);
  assert.equal(sample.parentLabel, "HW-2.3.1");
  const l1 = nodes.filter((n) => n.level === 1).map((n) => n.label);
  assert.deepEqual(l1, ["HW-1", "HW-2", "HW-3"]);
  assert.equal(nodes[0].displayName, "Habib Wahid-Root ID");
  assert.equal(foundationEmail("HW-ROOT"), "hw-root@foundation.darmelk.invalid");
  assert.equal(referralLinkFor("DM-ABC"), "https://darmelk.com/join/DM-ABC");
});

test("existing Darmelk commission rates are unchanged", () => {
  const src = read("backend/src/engine/commissions.ts");
  assert.match(src, /1: 0\.1/);
  assert.match(src, /2: 0\.08/);
  assert.match(src, /3: 0\.06/);
  assert.match(src, /4: 0\.04/);
  assert.match(src, /5: 0\.02/);
  assert.match(src, /getMatrixAncestors/);
  assert.doesNotMatch(src, /FOUNDATION/);
  const foundation = read("backend/src/engine/foundation.ts");
  assert.doesNotMatch(foundation, /from ["']\.\/commissions/);
  assert.match(foundation, /activation_status, activation_expires_at/);
});

test("annual activation fee remains BDT 1000 for ordinary members", () => {
  const src = read("backend/src/engine/activation.ts");
  assert.match(src, /const ACTIVATION_FEE = 1000/);
  const sql = read("migrations/0003_darmelk_ledger.sql");
  assert.match(sql, /check \("amount" = 1000\)/);
  const foundation = read("backend/src/engine/foundation.ts");
  assert.doesNotMatch(foundation, /insert into annual_activations/);
  assert.match(foundation, /Habib Wahid 121-ID foundation setup/);
});

test("referral link UX and join route feed the existing login ref search", () => {
  const join = read("src/routes/join.$code.tsx");
  const login = read("src/routes/login.tsx");
  const share = read("src/components/referral-share.tsx");
  const net = read("src/routes/app/network.tsx");
  const settings = read("src/routes/app/settings.tsx");
  const tree = read("src/routeTree.gen.ts");
  assert.match(join, /createFileRoute\("\/join\/\$code"\)/);
  assert.match(join, /mode: "create"/);
  assert.match(join, /ref: String\(params.code/);
  assert.match(login, /ref: typeof s.ref === "string"/);
  assert.match(login, /lookupSponsor/);
  assert.match(share, /Copy code/);
  assert.match(share, /Copy link/);
  assert.match(share, /navigator.share/);
  assert.match(net, /ReferralShareCard/);
  assert.match(settings, /ReferralShareCard/);
  assert.match(tree, /id: '\/join\/\$code'/);
});

test("package.json keeps the existing test script and adds darmelk CLI", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.test, /scripts\/\*\*\/\*\.test\.mjs/);
  assert.match(pkg.scripts.test, /darmelk-foundation\.test\.ts/);
  assert.equal(pkg.scripts.darmelk, "node --experimental-strip-types backend/src/foundation-cli.ts");
});

test("foundation CLI dry-run modifies nothing without DATABASE_URL", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "backend/src/foundation-cli.ts", "--dry-run"],
    { cwd: root, env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dryRun, true);
  assert.equal(report.expected.total, 121);
  assert.equal(report.passwordLogged, false);
  assert.doesNotMatch(result.stdout, /HW@2026#Common/);
  assert.doesNotMatch(result.stderr, /HW@2026#Common/);
});

test("foundation CLI refuses --confirm-reset without DATABASE_URL", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "backend/src/foundation-cli.ts", "--confirm-reset"],
    { cwd: root, env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /HW@2026#Common/);
});

test("foundation CLI refuses a different tree shape", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "backend/src/foundation-cli.ts", "--dry-run", "--branching=2"],
    { cwd: root, env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixed at --branching=3/);
});

test("password reset/change paths remain the Better Auth routes", () => {
  assert.match(read("src/routes/forgot-password.tsx"), /requestPasswordReset/);
  assert.match(read("src/routes/reset-password.tsx"), /resetPassword/);
  assert.match(read("backend/src/engine/foundation.ts"), /hashPassword/);
  assert.doesNotMatch(read("backend/src/engine/foundation.ts"), /insert into "account".*HW@2026/);
});

test("PGlite bootstrap creates 121 independent active members with genealogy", { timeout: 120000 }, async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const {
    createFoundationNetwork,
    deleteNonAdminMembers,
    validateFoundation,
    inspectResetScope,
    FOUNDATION_TOTAL,
    referralLinkFor,
  } = await import("../backend/src/engine/foundation.ts");
  const { verifyPassword } = await import("better-auth/crypto");

  const pg = new PGlite();
  await pg.waitReady;
  const files = readdirSync(join(root, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    const sql = readFileSync(join(root, "migrations", name), "utf8");
    await pg.exec(sql);
  }

  const client = {
    query: (text, params) => pg.query(text, params),
  };

  const adminId = randomUUID();
  await client.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'Admin', 'admin@darmelk.test', true, now(), now())`,
    [adminId],
  );
  await client.query(
    `insert into members (user_id, referral_code, role, onboarding_complete, activation_status)
     values ($1, 'DM-ADMIN01', 'admin', true, 'active')`,
    [adminId],
  );
  const legacyId = randomUUID();
  await client.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'Legacy Member', 'legacy@darmelk.test', true, now(), now())`,
    [legacyId],
  );
  await client.query(
    `insert into members (user_id, referral_code, role, sponsor_user_id)
     values ($1, 'DM-LEGACY1', 'member', $2)`,
    [legacyId, adminId],
  );

  const scope = await inspectResetScope(client);
  assert.equal(scope.admins.length, 1);
  assert.equal(scope.nonAdminCount, 1);

  const removed = await deleteNonAdminMembers(client);
  assert.equal(removed, 1);
  const leftover = await client.query(`select email from "user" order by email`);
  assert.deepEqual(
    leftover.rows.map((r) => r.email),
    ["admin@darmelk.test"],
  );

  const created = await createFoundationNetwork(client, { actorUserId: adminId, runId: randomUUID() });
  assert.equal(created.created, FOUNDATION_TOTAL);
  const validation = await validateFoundation(client);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(validation.active, 121);
  assert.equal(validation.commissionEligible, 121);
  assert.equal(validation.codes, 121);
  assert.equal(validation.credentials, 121);
  assert.equal(validation.wallets, 121);
  assert.deepEqual(validation.sampleAncestry, ["HW-2.3.1.2", "HW-2.3.1", "HW-2.3", "HW-2", "Habib Wahid-Root ID"]);
  assert.ok(validation.sampleReferral);
  assert.equal(validation.sampleReferral.link, referralLinkFor(validation.sampleReferral.code));

  const sample = await client.query(
    `select m.user_id, m.referral_code, a.password
       from members m
       join "user" u on u.id = m.user_id
       join "account" a on a."userId" = m.user_id
      where u.name = 'HW-2.3.1.2'`,
  );
  assert.equal(sample.rows.length, 1);
  assert.equal(await verifyPassword({ hash: sample.rows[0].password, password: "HW@2026#Common" }), true);
  const ancestorRows = await client.query(
    `with recursive up as (
       select network_parent_user_id as user_id, 1 as level
         from members where user_id = $1
       union all
       select m.network_parent_user_id, up.level + 1
         from members m
         join up on m.user_id = up.user_id
        where up.level < 5 and m.network_parent_user_id is not null
     )
     select u.name, up.level from up join "user" u on u.id = up.user_id
      where up.user_id is not null order by up.level asc`,
    [sample.rows[0].user_id],
  );
  assert.deepEqual(
    ancestorRows.rows.map((r) => r.name),
    ["HW-2.3.1", "HW-2.3", "HW-2", "Habib Wahid-Root ID"],
  );

  const admins = await client.query(`select count(*)::text as count from members where role = 'admin'`);
  assert.equal(Number(admins.rows[0].count), 1);
  const members = await client.query(`select count(*)::text as count from members where role = 'member'`);
  assert.equal(Number(members.rows[0].count), 121);
  const fakePay = await client.query(`select count(*)::text as count from annual_activations`);
  assert.equal(Number(fakePay.rows[0].count), 0);
  const fakeBook = await client.query(`select count(*)::text as count from bookings`);
  assert.equal(Number(fakeBook.rows[0].count), 0);
  const ledger = await client.query(`select count(*)::text as count from commission_ledger`);
  assert.equal(Number(ledger.rows[0].count), 0);

  const resolved = await client.query(
    `select u.name from members m join "user" u on u.id = m.user_id where m.referral_code = $1`,
    [sample.rows[0].referral_code],
  );
  assert.equal(resolved.rows[0].name, "HW-2.3.1.2");
});
