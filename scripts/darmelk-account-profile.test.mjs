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

const INVALID_PHONE = "Enter a valid Bangladesh mobile number, like 01712345678 or +8801712345678.";

async function loadProfile() {
  const dir = mkdtempSync(join(tmpdir(), "darmelk-profile-"));
  const outfile = join(dir, "profile.mjs");
  await esbuild.build({
    stdin: {
      contents: `export * as profile from ${JSON.stringify(join(root, "backend/src/engine/profile.ts"))};`,
      resolveDir: join(root, "backend/src"),
      sourcefile: "profile-entry.ts",
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
  return mod.profile;
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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${startMarker} → ${endMarker}`);
  return source.slice(start, end);
}

test("profile settings UI edits name and phone, keeps email read-only, and changes password through Better Auth", () => {
  const settings = read("src/routes/app/settings.tsx");
  const client = read("src/lib/api-client.ts");
  const router = read("backend/src/router.ts");
  const profile = read("backend/src/engine/profile.ts");
  const auth = read("backend/src/auth.ts");
  const forgot = read("src/routes/forgot-password.tsx");
  const reset = read("src/routes/reset-password.tsx");
  const currentUser = read("src/lib/auth/use-current-user.ts");
  const page = sliceBetween(settings, "function SettingsPage", "function PersonalInformation");
  const personal = sliceBetween(settings, "function PersonalInformation", "function ChangePassword");
  const security = sliceBetween(settings, "function ChangePassword", "function PayoutCredentials");
  const patch = sliceBetween(router, 'app.patch("/api/me/profile"', 'app.post("/api/me/onboarding"');

  const order = ["PersonalInformation", "ChangePassword", "PayoutCredentials", "ReferralShareCard", "Membership", "Sign out"];
  let at = -1;
  for (const label of order) {
    const next = page.indexOf(label, at + 1);
    assert.ok(next > at, `page order missing ${label}`);
    at = next;
  }

  assert.match(personal, /Full Name/);
  assert.match(personal, /onChange=\{\(e\) => setName\(e\.target\.value\)\}/);
  assert.match(personal, /const nextName = name\.trim\(\)/);
  assert.match(personal, /Full name is required\./);
  assert.match(personal, /Full name is too long\./);
  assert.match(personal, /NAME_MAX = 80|nextName\.length > NAME_MAX/);
  assert.match(settings, /const NAME_MAX = 80/);
  assert.match(personal, /authClient\.updateUser\(\{ name: nextName \}\)/);
  assert.doesNotMatch(personal, /updateUser\(\{[^}]*email/);
  assert.match(personal, /disableCookieCache: true/);
  assert.match(currentUser, /displayName: user\.name/);
  assert.match(personal, /Profile updated successfully\./);
  assert.match(personal, /Could not update your profile\. Please try again\./);
  assert.match(personal, /api\.updateProfile\(\{ phone: nextPhone \}\)/);
  assert.match(personal, /setPhone\(result\.member\.phone\)/);
  assert.match(personal, /reload\(\)/);
  assert.match(personal, /Phone Number/);
  assert.match(personal, /onChange=\{\(e\) => setPhone\(e\.target\.value\)\}/);
  assert.match(personal, /normalizeBdMobile\(rawPhone\)/);
  assert.match(settings, /INVALID_PHONE = "Enter a valid Bangladesh mobile number, like 01712345678 or \+8801712345678\."/);
  assert.match(personal, /Field label="Email" hint="Managed by sign-in\. Email cannot be changed here\."[\s\S]*disabled readOnly/);
  assert.doesNotMatch(personal, /Field label="Full Name"[\s\S]{0,240}disabled/);
  assert.doesNotMatch(personal, /Field label="Phone Number"[\s\S]{0,240}disabled/);
  assert.doesNotMatch(personal, /Change Email|changeEmail|email verification/i);
  assert.doesNotMatch(personal, /api\.onboarding|registerMemberWithActiveReferral|ensureMember/);

  assert.match(security, /Security/);
  assert.match(security, /Change password/);
  assert.match(security, /Update the password you use to sign in to your Darmelk account\./);
  assert.match(security, /label="Current password"/);
  assert.match(security, /label="New password"/);
  assert.match(security, /label="Confirm new password"/);
  assert.equal((security.match(/<PasswordField/g) ?? []).length, 3);
  assert.match(security, /Current password is required\./);
  assert.match(security, /Use at least 8 characters\./);
  assert.match(security, /New passwords do not match\./);
  assert.match(security, /newPassword\.length < 8/);
  const callAt = security.indexOf("authClient.changePassword");
  assert.ok(security.indexOf("Current password is required.") < callAt);
  assert.ok(security.indexOf("Use at least 8 characters.") < callAt);
  assert.ok(security.indexOf("New passwords do not match.") < callAt);
  assert.match(security, /authClient\.changePassword\(\{[\s\S]*currentPassword,[\s\S]*newPassword,[\s\S]*revokeOtherSessions: true/);
  assert.match(security, /setCurrentPassword\(""\)/);
  assert.match(security, /setNewPassword\(""\)/);
  assert.match(security, /setConfirmPassword\(""\)/);
  assert.match(security, /Password updated successfully\./);
  assert.match(security, /Current password is incorrect\./);
  assert.match(security, /Could not update password\. Please try again\./);
  assert.match(settings, /code === "INVALID_PASSWORD"/);
  assert.match(settings, /message === "Invalid password"/);
  assert.match(security, /to="\/forgot-password"/);
  assert.match(security, /Forgot your current password\?/);
  assert.match(security, /disableCookieCache: true/);
  assert.doesNotMatch(settings, /console\.(log|debug|info|warn|error)\(/);
  assert.doesNotMatch(settings, /update\s+"account"|account\.password|bcrypt|scrypt|argon/i);
  assert.doesNotMatch(settings, /NID|passport|selfie|date of birth/i);

  assert.match(client, /updateProfile: \(data: \{ phone: string \}\) => patch<\{ member: Member \}>\("\/api\/me\/profile", \{ phone: data\.phone \}\)/);
  assert.match(router, /app\.use\("\/api\/me\/\*", async \(c, next\) => \{\s*const user = await requireUser\(c\);/);
  assert.ok(router.indexOf('app.use("/api/me/*"') < router.indexOf('app.patch("/api/me/profile"'));
  assert.match(patch, /const userId = c\.get\("userId"\)/);
  assert.match(patch, /if \(!userId\) throw unauthorized\(\)/);
  assert.match(patch, /updateOwnMemberPhone\(client, userId, body\.phone\)/);
  assert.doesNotMatch(patch, /body\.(name|email|role|sponsor|referral|userId|user_id|network)/);
  assert.doesNotMatch(patch, /registerMemberWithActiveReferral|ensureMember|onboarding|recordConsents|password/);
  assert.doesNotMatch(router, /app\.(post|patch|put)\(\s*["'`][^"'`]*password/);
  assert.match(profile, /update members set phone = \$2, updated_at = now\(\) where user_id = \$1 returning \*/);
  assert.match(profile, /INVALID_PHONE_MESSAGE =\s*"Enter a valid Bangladesh mobile number, like 01712345678 or \+8801712345678\."/);
  assert.doesNotMatch(profile, /referral_code|sponsor_user_id|network_parent|network_slot|activation_status|\brole\b|insert into|password|onboarding/i);
  assert.doesNotMatch(profile, /console\./);
  assert.match(auth, /emailAndPassword:\s*\{\s*enabled: true/);
  assert.doesNotMatch(auth, /hash\s*:|minPasswordLength|additionalFields/);
  assert.match(forgot, /authClient\.requestPasswordReset/);
  assert.match(reset, /authClient\.resetPassword/);
  assert.match(read("src/routes/app/settings.tsx"), /ReferralShareCard/);
  assert.match(read("src/routes/app/settings.tsx"), /Financial Accounts/);
  assert.match(read("src/routes/app/settings.tsx"), /api\.savePayoutMethod/);

  const migrations = readdirSync(join(root, "migrations")).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(migrations.at(-1), "0022_darmelk_booking_terms_admin.sql");
});

test("PGlite: phone updates normalize, stay on the signed-in row, and leave identity and finance untouched", async () => {
  const profile = await loadProfile();
  const db = new PGlite();
  await applyMigrations(db);
  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('user_root', 'Root', 'root-profile@example.com', true, now(), now()),
      ('user_a', 'Member A', 'a-profile@example.com', true, now(), now()),
      ('user_b', 'Member B', 'b-profile@example.com', true, now(), now());
    insert into members (
      user_id, referral_code, phone, role, sponsor_user_id, network_parent_user_id, network_slot,
      onboarding_complete, activation_status
    ) values
      ('user_root', 'DM-ROOT01', '', 'admin', null, null, null, true, 'active'),
      ('user_a', 'DM-USERA', '', 'member', 'user_root', 'user_root', 1, true, 'inactive'),
      ('user_b', 'DM-USERB', '+8801711111111', 'member', 'user_root', 'user_root', 2, true, 'active');
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values
      ('acc_a', 'user_a', 'credential', 'user_a', 'hash-do-not-touch', now(), now());
  `);

  async function row(id) {
    const { rows } = await db.query(
      `select user_id, referral_code, phone, role, sponsor_user_id, network_parent_user_id, network_slot,
              onboarding_complete, activation_status, activation_expires_at
         from members where user_id = $1`,
      [id],
    );
    return rows[0];
  }

  async function financeCounts() {
    const tables = [
      "bookings",
      "booking_snapshots",
      "commission_ledger",
      "withdrawals",
      "annual_activations",
      "user_consents",
      "merchant_credit_ledger",
      "admin_actions",
    ];
    const counts = {};
    for (const table of tables) counts[table] = await count(db, `select count(*)::int as n from ${table}`);
    return counts;
  }

  const beforeFinance = await financeCounts();
  const beforeB = await row("user_b");
  const beforeRoot = await row("user_root");

  await assert.rejects(
    () => profile.updateOwnMemberPhone(db, "user_a", "12345"),
    (err) => err.code === "invalid_phone" && err.status === 400 && err.message === INVALID_PHONE,
  );
  await assert.rejects(
    () => profile.updateOwnMemberPhone(db, "user_a", "   "),
    (err) => err.code === "invalid_phone",
  );
  await assert.rejects(
    () => profile.updateOwnMemberPhone(db, "user_a", null),
    (err) => err.code === "invalid_phone",
  );
  assert.equal((await row("user_a")).phone, "");
  assert.equal(await count(db, `select count(*)::int as n from members`), 3);

  const added = await profile.updateOwnMemberPhone(db, "user_a", "01712345678");
  assert.equal(added.phone, "+8801712345678");
  const afterAdd = await row("user_a");
  assert.equal(afterAdd.phone, "+8801712345678");
  assert.equal(afterAdd.referral_code, "DM-USERA");
  assert.equal(afterAdd.role, "member");
  assert.equal(afterAdd.sponsor_user_id, "user_root");
  assert.equal(afterAdd.network_parent_user_id, "user_root");
  assert.equal(Number(afterAdd.network_slot), 1);
  assert.equal(afterAdd.onboarding_complete, true);
  assert.equal(afterAdd.activation_status, "inactive");
  assert.equal(afterAdd.activation_expires_at, null);
  assert.deepEqual(await row("user_b"), beforeB);
  assert.deepEqual(await row("user_root"), beforeRoot);

  const names = await db.query(`select id, name, email from "user" order by id`);
  assert.deepEqual(
    names.rows.map((r) => [r.id, r.name, r.email]),
    [
      ["user_a", "Member A", "a-profile@example.com"],
      ["user_b", "Member B", "b-profile@example.com"],
      ["user_root", "Root", "root-profile@example.com"],
    ],
  );
  const password = await db.query(`select password from account where id = 'acc_a'`);
  assert.equal(password.rows[0].password, "hash-do-not-touch");
  assert.deepEqual(await financeCounts(), beforeFinance);
  assert.equal(await count(db, `select count(*)::int as n from members`), 3);

  const canonical = await profile.updateOwnMemberPhone(db, "user_a", "+8801712345678");
  assert.equal(canonical.phone, "+8801712345678");
  const spaced = await profile.updateOwnMemberPhone(db, "user_a", "017-1234-5679");
  assert.equal(spaced.phone, "+8801712345679");
  const spacedAgain = await profile.updateOwnMemberPhone(db, "user_a", " 017 1234 5670 ");
  assert.equal(spacedAgain.phone, "+8801712345670");

  await assert.rejects(
    () => profile.updateOwnMemberPhone(db, "user_missing", "01712345678"),
    (err) => err.code === "incomplete_registration" && err.status === 409,
  );
  assert.equal(await count(db, `select count(*)::int as n from members`), 3);
  assert.equal((await row("user_a")).referral_code, "DM-USERA");
  assert.equal((await row("user_a")).sponsor_user_id, "user_root");
  assert.equal((await row("user_a")).network_parent_user_id, "user_root");
  assert.equal(Number((await row("user_a")).network_slot), 1);
  assert.equal((await row("user_b")).phone, "+8801711111111");
  assert.deepEqual(await financeCounts(), beforeFinance);
});
