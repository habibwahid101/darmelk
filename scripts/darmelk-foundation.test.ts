import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

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
  assert.deepEqual(nodes.filter((n) => n.level === 1).map((n) => n.label), ["HW-1", "HW-2", "HW-3"]);
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
  assert.doesNotMatch(src, /FOUNDATION/);
  const foundation = read("backend/src/engine/foundation.ts");
  assert.doesNotMatch(foundation, /from ["']\.\/commissions/);
});

test("foundation activation sentinel remains 9999-12-31 and ordinary fee stays BDT 1000", async () => {
  const foundation = read("backend/src/engine/foundation.ts");
  assert.match(foundation, /FOUNDATION_ACTIVATION_EXPIRES_AT = "9999-12-31T23:59:59\.000Z"/);
  assert.doesNotMatch(foundation, /100 \* 365 \* 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(foundation, /insert into annual_activations/);
  assert.doesNotMatch(foundation, /insert into bookings/);
  assert.match(foundation, /Habib Wahid 121-ID foundation setup/);
  const { FOUNDATION_ACTIVATION_EXPIRES_AT, isFoundationActivationSentinel } = await import(
    "../backend/src/engine/foundation.ts"
  );
  assert.equal(isFoundationActivationSentinel(FOUNDATION_ACTIVATION_EXPIRES_AT), true);
  assert.match(read("backend/src/engine/activation.ts"), /const ACTIVATION_FEE = 1000/);
});

test("referral link UX and join route feed the existing login ref search", () => {
  const join = read("src/routes/join.$code.tsx");
  const login = read("src/routes/login.tsx");
  const share = read("src/components/referral-share.tsx");
  assert.match(join, /createFileRoute\("\/join\/\$code"\)/);
  assert.match(join, /mode: "create"/);
  assert.match(login, /ref: typeof s.ref === "string"/);
  assert.match(share, /Copy code/);
  assert.match(share, /Copy link/);
  assert.match(read("src/routes/app/network.tsx"), /ReferralShareCard/);
  assert.match(read("src/routes/app/settings.tsx"), /ReferralShareCard/);
  assert.match(read("src/routeTree.gen.ts"), /id: '\/join\/\$code'/);
});

test("one-time bootstrap execution is removed from product source", () => {
  const foundation = read("backend/src/engine/foundation.ts");
  const cli = read("backend/src/foundation-cli.ts");
  const pkg = JSON.parse(read("package.json"));
  assert.doesNotMatch(foundation, /createFoundationNetwork/);
  assert.doesNotMatch(foundation, /deleteNonAdminMembers/);
  assert.doesNotMatch(foundation, /FOUNDATION_PASSWORD/);
  assert.doesNotMatch(foundation, /hashPassword/);
  assert.doesNotMatch(foundation, /HW@2026/);
  assert.equal(pkg.scripts.darmelk, undefined);
  assert.match(pkg.scripts["darmelk:foundation-registry"], /foundation-cli/);
  assert.match(cli, /Foundation bootstrap execution is closed/);
  assert.match(cli, /SET TRANSACTION READ ONLY/);
  assert.doesNotMatch(cli, /createFoundationNetwork/);
  assert.doesNotMatch(cli, /--confirm-reset/);
  assert.match(read("backend/src/router.ts"), /\/api\/admin\/foundation-registry/);
  assert.match(read("backend/src/router.ts"), /SET TRANSACTION READ ONLY/);
  assert.match(read("src/routes/admin/foundation-registry.tsx"), /Read-only Habib Wahid foundation accounts/);
});

test("read-only registry CLI refuses execute flags and missing DATABASE_URL", () => {
  const refuse = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "backend/src/foundation-cli.ts", "--confirm-production"],
    { cwd: root, env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" },
  );
  assert.equal(refuse.status, 1);
  assert.match(refuse.stderr, /Foundation bootstrap execution is closed/);
  const missing = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "backend/src/foundation-cli.ts"],
    { cwd: root, env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" },
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /DATABASE_URL is required/);
});

test("password reset/change paths remain the Better Auth routes", () => {
  assert.match(read("src/routes/forgot-password.tsx"), /requestPasswordReset/);
  assert.match(read("src/routes/reset-password.tsx"), /resetPassword/);
  assert.match(read("backend/src/auth.ts"), /emailAndPassword/);
});

test("registry CSV export columns stay non-secret", async () => {
  const { foundationRegistryCsv } = await import("../backend/src/engine/foundation.ts");
  const csv = foundationRegistryCsv([
    {
      label: "HW-1",
      loginEmail: "hw-1@foundation.darmelk.invalid",
      referralCode: "DM-TEST",
      referralUrl: "https://darmelk.com/join/DM-TEST",
      level: 1,
      sponsorLabel: "Habib Wahid-Root ID",
      networkParentLabel: "Habib Wahid-Root ID",
      slot: 1,
    },
  ]);
  assert.match(csv, /label,login_email,referral_code,referral_url,level,sponsor_label,network_parent_label,slot/);
  assert.doesNotMatch(csv, /password/i);
  assert.doesNotMatch(csv, /hash/i);
  assert.doesNotMatch(csv, /session/i);
  assert.doesNotMatch(csv, /token/i);
});
