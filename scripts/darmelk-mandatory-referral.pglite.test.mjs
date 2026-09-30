import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "backend/package.json"));
const esbuild = require("esbuild");
const read = (rel) => readFileSync(join(root, rel), "utf8");

async function loadGate() {
  const dir = mkdtempSync(join(root, ".tmp-referral-"));
  const outfile = join(dir, "gate.mjs");
  await esbuild.build({
    stdin: {
      contents: `
        import { betterAuth } from "better-auth";
        import { referralSignupHook } from ${JSON.stringify(join(root, "backend/src/auth-referral-hook.ts"))};
        import { assertSignupReferral, ensureMember, registerMemberWithActiveReferral } from ${JSON.stringify(join(root, "backend/src/engine/members.ts"))};
        import { pgliteDialect } from ${JSON.stringify(join(root, "src/lib/auth/pglite-dialect.ts"))};
        export { assertSignupReferral, ensureMember, registerMemberWithActiveReferral };
        export function createGatedAuth(db) {
          return betterAuth({
            baseURL: "http://localhost:3000",
            secret: "darmelk-test-secret-darmelk-test-secret",
            database: { dialect: pgliteDialect(async () => db), type: "postgres" },
            trustedOrigins: ["http://localhost:3000"],
            emailAndPassword: { enabled: true },
            rateLimit: { enabled: false },
            session: { cookieCache: { enabled: false } },
            advanced: { defaultCookieAttributes: { sameSite: "lax", secure: false } },
            hooks: {
              before: referralSignupHook(async (code) => {
                await assertSignupReferral(db, code);
              }),
            },
          });
        }
      `,
      resolveDir: join(root, "backend/src"),
      sourcefile: "referral-gate-entry.ts",
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

async function countsFor(db, email) {
  const users = await db.query(`select id from "user" where lower(email) = lower($1)`, [email]);
  const userId = users.rows[0]?.id ?? null;
  const accounts = userId
    ? await db.query(`select id, password, "providerId" from account where "userId" = $1`, [userId])
    : { rows: [] };
  const members = userId
    ? await db.query(`select * from members where user_id = $1`, [userId])
    : { rows: [] };
  return {
    users: users.rows.length,
    accounts: accounts.rows.length,
    members: members.rows.length,
    userId,
    account: accounts.rows[0] ?? null,
    member: members.rows[0] ?? null,
  };
}

async function postSignUp(auth, email, referral) {
  const headers = {
    "content-type": "application/json",
    origin: "http://localhost:3000",
  };
  if (referral !== undefined) headers["x-darmelk-referral"] = referral;
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: "password123", name: "New Member" }),
    }),
  );
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test("signup UI, pre-auth hook, and activation checkbox stay in the required shape", () => {
  const login = read("src/routes/login.tsx");
  const auth = read("backend/src/auth.ts");
  const hook = read("backend/src/auth-referral-hook.ts");
  const router = read("backend/src/router.ts");
  const activation = read("src/routes/app/activation.tsx");
  const booking = read("src/routes/app/book.$slug.tsx");
  const terms = read("backend/src/engine/terms.ts");
  const activationEngine = read("backend/src/engine/activation.ts");
  const recovery = read("src/components/complete-registration.tsx");
  const shell = read("src/components/layout/app-shell.tsx");
  assert.match(login, /DARMELK_REFERRAL_HEADER/);
  assert.match(read("src/lib/referral.ts"), /x-darmelk-referral/);
  assert.match(auth, /referralSignupHook/);
  assert.match(hook, /APIError\.from\("BAD_REQUEST"/);
  assert.match(router, /x-darmelk-referral/);
  assert.match(router, /incompleteRegistration: true/);
  assert.doesNotMatch(router, /ensureMember\(client, \{ id: userId, email \}\)/);
  assert.match(shell, /CompleteRegistration/);
  assert.match(recovery, /api\.onboarding/);
  assert.match(recovery, /Referral ID is required\./);
  assert.equal((activation.match(/type="checkbox"/g) ?? []).length, 1);
  assert.match(booking, /TermsAccept/);
  assert.match(booking, /Confirm Booking/);
  assert.match(terms, /Referral ID is optional on General signup/);
  assert.match(activationEngine, /const ACTIVATION_FEE = 1000/);
  assert.doesNotMatch(activationEngine, /delete from user_consents/i);
  const migrations = readdirSync(join(root, "migrations")).filter((name) => name.endsWith(".sql"));
  assert.equal(migrations.includes("0023_darmelk_mandatory_referral.sql"), false);
});

test("direct sign-up without an active referral creates no identity", async () => {
  const gate = await loadGate();
  const db = new PGlite();
  await applyMigrations(db);
  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('user_sponsor', 'Sponsor', 'sponsor@example.com', true, now(), now()),
      ('user_inactive', 'Inactive', 'inactive@example.com', true, now(), now()),
      ('user_expired', 'Expired', 'expired@example.com', true, now(), now()),
      ('user_done', 'Done Sponsorless', 'done-sponsorless@example.com', true, now(), now()),
      ('user_orphan', 'Orphan', 'orphan@example.com', true, now(), now());
    insert into members (user_id, referral_code, role, onboarding_complete, activation_status, activation_expires_at) values
      ('user_sponsor', 'DM-ACTIVE', 'member', true, 'active', '9999-12-31T23:59:59.000Z'),
      ('user_inactive', 'DM-INACTIVE', 'member', true, 'inactive', null),
      ('user_expired', 'DM-EXPIRED', 'member', true, 'active', '2000-01-01T00:00:00.000Z'),
      ('user_done', 'DM-DONE', 'member', true, 'inactive', null);
  `);
  const beforeUsers = Number((await db.query(`select count(*)::int as n from "user"`)).rows[0].n);
  const beforeMembers = Number((await db.query(`select count(*)::int as n from members`)).rows[0].n);
  const auth = gate.createGatedAuth(db);

  const blank = await postSignUp(auth, "blank@example.com", "   ");
  const missing = await postSignUp(auth, "missing@example.com");
  const invalid = await postSignUp(auth, "invalid@example.com", "DM-NOTREAL");
  const inactive = await postSignUp(auth, "inactive-try@example.com", "DM-INACTIVE");
  const expired = await postSignUp(auth, "expired-try@example.com", "DM-EXPIRED");
  for (const result of [blank, missing, invalid, inactive, expired]) {
    assert.notEqual(result.status, 200);
  }
  for (const email of ["blank@example.com", "missing@example.com", "invalid@example.com", "inactive-try@example.com", "expired-try@example.com"]) {
    const row = await countsFor(db, email);
    assert.equal(row.users, 0);
    assert.equal(row.accounts, 0);
    assert.equal(row.members, 0);
  }
  assert.equal(Number((await db.query(`select count(*)::int as n from "user"`)).rows[0].n), beforeUsers);
  assert.equal(Number((await db.query(`select count(*)::int as n from members`)).rows[0].n), beforeMembers);
  assert.equal(Number((await db.query(`select count(*)::int as n from account`)).rows[0].n), 0);

  await assert.rejects(
    () => gate.ensureMember(db, { id: "user_orphan", email: "orphan@example.com" }),
    (err) => err.code === "incomplete_registration",
  );
  assert.equal((await countsFor(db, "orphan@example.com")).members, 0);
  assert.equal((await countsFor(db, "orphan@example.com")).users, 1);

  const orphan = await gate.registerMemberWithActiveReferral(
    db,
    { id: "user_orphan", email: "orphan@example.com" },
    { sponsorCode: "DM-ACTIVE", phone: "" },
  );
  assert.equal(orphan.sponsor_user_id, "user_sponsor");
  assert.equal(orphan.network_parent_user_id, "user_sponsor");
  assert.equal(orphan.network_slot, 1);
  assert.equal((await countsFor(db, "orphan@example.com")).users, 1);
  assert.equal((await countsFor(db, "orphan@example.com")).members, 1);

  const historical = await gate.registerMemberWithActiveReferral(
    db,
    { id: "user_done", email: "done-sponsorless@example.com" },
    { sponsorCode: "DM-ACTIVE", phone: "" },
  );
  assert.equal(historical.sponsor_user_id, null);
  assert.equal(historical.onboarding_complete, true);

  const valid = await postSignUp(auth, "valid@example.com", "DM-ACTIVE");
  assert.equal(valid.status, 200, JSON.stringify(valid.body));
  const created = await countsFor(db, "valid@example.com");
  assert.equal(created.users, 1);
  assert.equal(created.accounts, 1);
  assert.equal(created.account.providerId, "credential");
  assert.equal(typeof created.account.password, "string");
  assert.notEqual(created.account.password, "password123");
  assert.equal(created.members, 0);
  const member = await gate.registerMemberWithActiveReferral(
    db,
    { id: created.userId, email: "valid@example.com" },
    { sponsorCode: "DM-ACTIVE", phone: "" },
  );
  assert.equal(member.sponsor_user_id, "user_sponsor");
  assert.equal(member.network_parent_user_id, "user_sponsor");
  assert.ok(member.network_slot === 1 || member.network_slot === 2);
  const again = await gate.registerMemberWithActiveReferral(
    db,
    { id: created.userId, email: "valid@example.com" },
    { sponsorCode: "DM-INACTIVE", phone: "changed" },
  );
  assert.equal(again.sponsor_user_id, "user_sponsor");
  assert.equal(again.user_id, created.userId);
  assert.equal((await countsFor(db, "valid@example.com")).users, 1);
  assert.equal((await countsFor(db, "valid@example.com")).members, 1);

  const signIn = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "valid@example.com", password: "password123" }),
    }),
  );
  assert.equal(signIn.status, 200);
  await db.close();
});
