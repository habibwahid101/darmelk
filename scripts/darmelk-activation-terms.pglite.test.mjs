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

async function loadActivation() {
  const dir = mkdtempSync(join(tmpdir(), "darmelk-terms-"));
  const outfile = join(dir, "activation.mjs");
  await esbuild.build({
    stdin: {
      contents: `export * as activation from ${JSON.stringify(join(root, "backend/src/engine/activation.ts"))};`,
      resolveDir: join(root, "backend/src"),
      sourcefile: "terms-entry.ts",
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
  return mod.activation;
}

async function applyMigrations(db) {
  const files = readdirSync(join(root, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    await db.exec(readFileSync(join(root, "migrations", name), "utf8"));
  }
}

async function count(db, sql, params = []) {
  const { rows } = await db.query(sql, params);
  return Number(rows[0]?.n ?? 0);
}

test("activation terms UI asks only for the current versions that are missing", () => {
  const page = read("src/routes/app/activation.tsx");
  const engine = read("backend/src/engine/activation.ts");
  assert.match(page, /api\.myConsents\(\)/);
  assert.match(page, /api\.terms\(\["GROWTH_PROGRAM_TERMS", "GROWTH_ACTIVATION_TERMS"\]\)/);
  assert.match(page, /api\.requestActivation\(crypto\.randomUUID\(\), outstanding\.length > 0\)/);
  assert.doesNotMatch(page, /requestActivation\(crypto\.randomUUID\(\), true\)/);
  assert.match(page, /type="checkbox"/);
  assert.equal((page.match(/type="checkbox"/g) ?? []).length, 1);
  assert.match(page, /outstanding\.length > 0/);
  assert.match(page, /\/terms\?key=growth-program/);
  assert.match(page, /\/terms\?key=growth-activation/);
  assert.match(page, /Growth Program Terms/);
  assert.match(page, /Growth Activation Terms/);
  assert.match(page, /Current Growth Program Terms and Growth Activation Terms are already accepted/);
  assert.doesNotMatch(page, /TermsAccept/);
  assert.doesNotMatch(page, /remaining Growth terms/);
  assert.match(page, /for \(const item of outstanding\) next\[item\.key\] = value/);
  assert.match(page, /PaymentForm targetType="activation"/);
  assert.match(page, /termsLoaded && outstanding\.every/);
  assert.match(engine, /hasCurrentConsent/);
  assert.match(engine, /missingTerms/);
  assert.match(engine, /requireCurrentConsents/);
  assert.match(engine, /acceptGrowthTerms !== true/);
  assert.doesNotMatch(engine, /delete from user_consents/i);
  assert.doesNotMatch(engine, /update user_consents/i);
  assert.match(read("backend/src/engine/terms.ts"), /version: "1"/);
});

test("PGlite: current Growth terms are not requested or recorded twice", async () => {
  const activation = await loadActivation();
  const db = new PGlite();
  await applyMigrations(db);
  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('user_sponsor', 'Sponsor', 'sponsor-terms@example.com', true, now(), now()),
      ('user_both', 'Both', 'both-terms@example.com', true, now(), now()),
      ('user_one', 'One', 'one-terms@example.com', true, now(), now()),
      ('user_none', 'None', 'none-terms@example.com', true, now(), now()),
      ('user_old', 'Old', 'old-terms@example.com', true, now(), now());
    insert into members (user_id, referral_code, role, onboarding_complete, activation_status, sponsor_user_id) values
      ('user_sponsor', 'DM-SPON01', 'member', true, 'active', null),
      ('user_both', 'DM-BOTH01', 'member', true, 'inactive', 'user_sponsor'),
      ('user_one', 'DM-ONE001', 'member', true, 'inactive', 'user_sponsor'),
      ('user_none', 'DM-NONE01', 'member', true, 'inactive', 'user_sponsor'),
      ('user_old', 'DM-OLD001', 'member', true, 'inactive', 'user_sponsor');
    insert into user_consents (id, user_id, document_key, document_version, context, reference_key) values
      ('cns_both_program', 'user_both', 'GROWTH_PROGRAM_TERMS', '1', 'signup', ''),
      ('cns_both_activation', 'user_both', 'GROWTH_ACTIVATION_TERMS', '1', 'growth_activation', ''),
      ('cns_one_program', 'user_one', 'GROWTH_PROGRAM_TERMS', '1', 'signup', ''),
      ('cns_old_program', 'user_old', 'GROWTH_PROGRAM_TERMS', '0', 'signup', ''),
      ('cns_old_activation', 'user_old', 'GROWTH_ACTIVATION_TERMS', '0', 'growth_activation', '');
  `);

  const both = await activation.requestActivation(db, "user_both", { acceptGrowthTerms: false });
  assert.equal(both.status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_both'`), 2);
  await assert.rejects(
    () => activation.requestActivation(db, "user_both", { acceptGrowthTerms: true }),
    (err) => err.status === 409,
  );
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_both'`), 2);

  await assert.rejects(
    () => activation.requestActivation(db, "user_one", { acceptGrowthTerms: false }),
    (err) => err.code === "terms_required",
  );
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_one'`), 1);
  assert.equal(await count(db, `select count(*)::int as n from annual_activations where user_id = 'user_one'`), 0);
  const one = await activation.requestActivation(db, "user_one", { acceptGrowthTerms: true });
  assert.equal(one.status, "pending");
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_one' and document_key = 'GROWTH_PROGRAM_TERMS' and document_version = '1'`),
    1,
  );
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_one' and document_key = 'GROWTH_ACTIVATION_TERMS' and document_version = '1'`),
    1,
  );
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_one'`), 2);

  await assert.rejects(
    () => activation.requestActivation(db, "user_none", {}),
    (err) => err.code === "terms_required",
  );
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_none'`), 0);
  const none = await activation.requestActivation(db, "user_none", { acceptGrowthTerms: true });
  assert.equal(none.status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_none' and document_version = '1'`), 2);
  await db.query(`update members set activation_status = 'inactive' where user_id = 'user_none'`);
  await db.query(`update annual_activations set status = 'rejected' where user_id = 'user_none'`);
  const noneAgain = await activation.requestActivation(db, "user_none", { acceptGrowthTerms: true });
  assert.equal(noneAgain.status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_none'`), 2);

  await assert.rejects(
    () => activation.requestActivation(db, "user_old", { acceptGrowthTerms: false }),
    (err) => err.code === "terms_required",
  );
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_old' and document_version = '0'`), 2);
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_old' and document_version = '1'`), 0);
  const renewed = await activation.requestActivation(db, "user_old", { acceptGrowthTerms: true });
  assert.equal(renewed.status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_old' and document_version = '0'`), 2);
  assert.equal(await count(db, `select count(*)::int as n from user_consents where user_id = 'user_old' and document_version = '1'`), 2);
});
