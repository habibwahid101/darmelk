import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("growth-program is an authenticated gateway with a mandatory referral gate", () => {
  const src = read("src/routes/growth-program.tsx");
  assert.match(src, /createFileRoute\("\/growth-program"\)/);
  assert.match(src, /Navigate to="\/login"/);
  assert.match(src, /search=\{\{\s*next: GROWTH_PROGRAM_PATH\s*\}\}/);
  assert.match(src, /isGrowthParticipant\(member\)/);
  assert.match(src, /to="\/app\/activation"/);
  assert.match(src, /Referral ID/);
  assert.match(src, /required/);
  assert.match(src, /aria-required="true"/);
  assert.match(src, /bindGrowthSponsor/);
  assert.match(src, /window\.location\.assign\(dest\)/);
  assert.doesNotMatch(src, /optional referral/i);
});

test("guest return path is closed: only /growth-program is accepted", () => {
  const growth = read("src/lib/growth.ts");
  const login = read("src/routes/login.tsx");
  assert.match(growth, /export const GROWTH_PROGRAM_PATH = "\/growth-program"/);
  assert.match(growth, /next === GROWTH_PROGRAM_PATH \? GROWTH_PROGRAM_PATH : undefined/);
  assert.match(login, /next: safeGrowthReturn\(s\.next\)/);
  assert.match(login, /if \(next\) \{[\s\S]*navigate\(\{\s*to: next\s*\}\)/);
  assert.doesNotMatch(login, /window\.location|document\.location/);
  assert.doesNotMatch(growth, /decodeURIComponent\(next\)/);
});

test("sponsorless General /app does not look like Growth membership", () => {
  const shell = read("src/components/layout/app-shell.tsx");
  const overview = read("src/routes/app/index.tsx");
  assert.match(shell, /GENERAL_PRIMARY/);
  assert.match(shell, /GROWTH_PRIMARY/);
  assert.match(shell, /to: "\/growth-program", label: "Growth Program"/);
  assert.match(shell, /JoinGrowthCard/);
  assert.doesNotMatch(shell.slice(shell.indexOf("GENERAL_PRIMARY"), shell.indexOf("GROWTH_PRIMARY")), /Network/);
  assert.doesNotMatch(shell.slice(shell.indexOf("GENERAL_PRIMARY"), shell.indexOf("GROWTH_PRIMARY")), /Qualification/);
  assert.doesNotMatch(shell.slice(shell.indexOf("GENERAL_PRIMARY"), shell.indexOf("GROWTH_PRIMARY")), /Commission/);
  assert.doesNotMatch(shell.slice(shell.indexOf("GENERAL_PRIMARY"), shell.indexOf("GROWTH_PRIMARY")), /Leadership/);
  assert.doesNotMatch(shell.slice(shell.indexOf("GENERAL_MORE"), shell.indexOf("GROWTH_MORE")), /Activation/);
  assert.match(shell, /GROWTH_LOCKED/);
  assert.match(overview, /if \(!inGrowth\)/);
  assert.match(overview, /Join Growth Program/);
  assert.match(overview, /Browse properties/);
  const generalOverview = overview.slice(
    overview.indexOf("if (!inGrowth)"),
    overview.indexOf("Your property, progress, and financial activity"),
  );
  assert.doesNotMatch(generalOverview, /Activate Your Darmelk ID/);
  assert.doesNotMatch(generalOverview, /Qualification Progress/);
  assert.doesNotMatch(generalOverview, /Available Commission/);
});

test("bind-sponsor-later API is dedicated, atomic, and immutable", () => {
  const engine = read("backend/src/engine/members.ts");
  const router = read("backend/src/router.ts");
  const client = read("src/lib/api-client.ts");
  assert.match(router, /app\.post\("\/api\/me\/growth\/sponsor"/);
  assert.match(router, /bindSponsorForGrowth/);
  assert.match(client, /bindGrowthSponsor/);
  assert.match(engine, /export async function bindSponsorForGrowth/);
  assert.match(engine, /select \* from members where user_id = \$1 for update/);
  assert.match(engine, /alreadyBound: true/);
  assert.match(engine, /findOpenMatrixSlot/);
  assert.match(engine, /sponsor_user_id is null/);
  assert.match(engine, /isUniqueViolation\(err\)/);
  assert.match(engine, /growth_referral_required/);
  const bind = engine.slice(engine.indexOf("export async function bindSponsorForGrowth"));
  assert.doesNotMatch(bind, /postCommissionsForBooking|requestActivation|createBooking|syncLeadershipReward|evaluatePromotions/);
});

test("public chrome does not add a loud Growth Program CTA", () => {
  const header = read("src/components/layout/site-header.tsx");
  const landing = read("src/components/landing/landing-page.tsx");
  assert.doesNotMatch(header, /Growth Program/);
  assert.doesNotMatch(landing, /to="\/growth-program"/);
  assert.match(header, /label: "Properties"/);
  assert.match(header, /label: "Contact"/);
});

test("general signup stays optional and Batch 02 contracts remain", () => {
  const login = read("src/routes/login.tsx");
  const engine = read("backend/src/engine/members.ts");
  const onboarding = engine.slice(
    engine.indexOf("export async function completeOnboarding"),
    engine.indexOf("export async function bindSponsorForGrowth"),
  );
  assert.match(login, /Referral ID \(Optional\)/);
  assert.doesNotMatch(login, /Growth Program/);
  assert.doesNotMatch(onboarding, /sponsor_required|growth_referral_required/);
  assert.match(onboarding, /if \(sponsor\) \{[\s\S]*findOpenMatrixSlot/);
  assert.match(onboarding, /sponsor\?\.user_id \?\? null/);
});

test("annual activation amount is unchanged and no new migration was added", () => {
  const activation = read("backend/src/engine/activation.ts");
  const page = read("src/routes/app/activation.tsx");
  const overview = read("src/routes/app/index.tsx");
  assert.match(activation, /1000/);
  assert.match(page, /const ACTIVATION_FEE = 1000/);
  assert.match(overview, /BDT 1,000/);
  const migrations = readdirSync(join(root, "migrations")).filter((name) => /^\d+_.*\.sql$/.test(name));
  assert.ok(!migrations.some((name) => Number(name.slice(0, 4)) > 17));
});

test("growth engines are not rewritten in the growth-program batch", () => {
  const network = read("backend/src/engine/network.ts");
  const commissions = read("backend/src/engine/commissions.ts");
  const leadership = read("backend/src/engine/leadership.ts");
  const merchant = read("backend/src/engine/merchant.ts");
  const promotions = read("backend/src/engine/promotions.ts");
  const bookings = read("backend/src/engine/bookings.ts");
  const withdrawals = read("backend/src/engine/withdrawals.ts");
  assert.match(network, /PERSONAL_SPONSOR_TARGET = 3/);
  assert.match(commissions, /1: 0\.1/);
  assert.match(leadership, /TIER_100K|100000/);
  assert.match(merchant, /approveMerchantPaymentRequest|reserve/);
  assert.match(promotions, /evaluatePromotionsForConfirmedBooking/);
  assert.match(bookings, /activateBooking/);
  assert.match(withdrawals, /status/);
});
