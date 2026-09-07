import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("leadership reward schema is additive, unique, and append-only", () => {
  const sql = read("migrations/0014_darmelk_leadership_reward.sql");
  assert.match(sql, /leadership_reward_cycles/);
  assert.match(sql, /leadership_reward_entitlements/);
  assert.match(sql, /leadership_reward_tier_events/);
  assert.match(sql, /leadership_reward_cycles_user_unique/);
  assert.match(sql, /leadership_reward_entitlements_month_unique/);
  assert.match(sql, /on conflict \(cycle_id, reward_month\) do nothing|unique \("cycle_id", "reward_month"\)/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /commission_ledger/);
  assert.doesNotMatch(sql, /booking_snapshots/);
});

test("engine uses Level 5 completion, following month, and any-3 directs", () => {
  const engine = read("backend/src/engine/leadership.ts");
  assert.match(engine, /Asia\/Dhaka/);
  assert.match(engine, /followingMonth/);
  assert.match(engine, /LEVEL_CAPACITY\[5\]/);
  assert.match(engine, /DIRECT_TARGET = 3/);
  assert.match(engine, /TIER_25K = 25_000/);
  assert.match(engine, /TIER_50K = 50_000/);
  assert.match(engine, /TIER_100K = 100_000/);
  assert.match(engine, /CYCLE_MONTHS = 12/);
  assert.match(engine, /on conflict \(user_id\) do nothing/);
  assert.match(engine, /on conflict \(cycle_id, reward_month\) do nothing/);
  assert.match(engine, /on conflict \(cycle_id, tier\) do nothing/);
  assert.match(engine, /sponsor_user_id/);
  assert.match(engine, /refreshExistingCycle/);
  assert.doesNotMatch(engine, /Months 1–4|months 1-4|Month 1-4/);
  assert.doesNotMatch(engine, /Employee Salary/);
  assert.doesNotMatch(engine, /Merchant Credit/);
  assert.doesNotMatch(engine, /Promotion Reward/);
});

test("user and admin screens are named Leadership Reward", () => {
  assert.match(read("src/components/layout/app-shell.tsx"), /Leadership Reward/);
  assert.match(read("src/components/layout/admin-shell.tsx"), /Leadership Rewards/);
  assert.match(read("src/routes/app/leadership-reward.tsx"), /Complete Level 5 to become eligible/);
  assert.match(read("src/routes/app/leadership-reward.tsx"), /Month \$\{cycle.currentMonthNumber\} of 12/);
  assert.match(read("src/routes/app/leadership-reward.tsx"), /personally sponsored members qualified/);
  assert.match(read("src/routes/app/leadership-reward.tsx"), /Round completed/);
  assert.match(read("src/routes/admin/leadership-rewards.index.tsx"), /Leadership Rewards/);
  assert.match(read("src/routes/admin/leadership-rewards.$userId.tsx"), /historical amounts stay as recorded/);
  assert.doesNotMatch(read("src/routes/admin/leadership-rewards.$userId.tsx"), /Set balance|Change total earned/);
  assert.doesNotMatch(read("src/routes/app/leadership-reward.tsx"), /Employee Salary/);
});

test("APIs are role-protected and do not add a payout rail", () => {
  const router = read("backend/src/router.ts");
  assert.match(router, /\/api\/me\/leadership-reward/);
  assert.match(router, /\/api\/admin\/leadership-rewards/);
  assert.match(router, /requireAdmin/);
  assert.match(router, /syncLeadershipReward/);
  assert.doesNotMatch(router, /leadership-rewards\/.*\/pay/);
  assert.doesNotMatch(router, /Set balance/);
});

test("merchant and promotion batches were not implemented", () => {
  const files = [
    "backend/src/engine/leadership.ts",
    "backend/src/router.ts",
    "src/routes/app/leadership-reward.tsx",
    "src/components/layout/app-shell.tsx",
  ];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /Become a Merchant/);
    assert.doesNotMatch(src, /Pay by Merchant/);
    assert.doesNotMatch(src, /promotional gifts/i);
  }
});

test("batch 1 career, footer, and hero remain intact", () => {
  const footer = read("src/components/layout/site-footer.tsx");
  const landing = read("src/components/landing/landing-page.tsx");
  assert.match(footer, /to="\/career"/);
  assert.doesNotMatch(footer, />Explore</);
  assert.match(landing, /<span>Explore Property Opportunities<\/span>/);
  assert.match(read("src/routes/admin/career.index.tsx"), /Career Management/);
  assert.match(read("src/routes/app/network.tsx"), /Current Level Progress/);
});

test("existing commission, network, and withdrawal rules remain intact", () => {
  assert.match(read("backend/src/engine/commissions.ts"), /1: 0.1/);
  assert.match(read("backend/src/engine/commissions.ts"), /2: 0.08/);
  assert.match(read("backend/src/engine/commissions.ts"), /5: 0.02/);
  assert.match(read("backend/src/engine/network.ts"), /PERSONAL_SPONSOR_TARGET = 3/);
  assert.match(read("backend/src/engine/network.ts"), /5: 243/);
  assert.match(read("backend/src/engine/withdrawals.ts"), /lockWithdrawalFunds/);
  assert.match(read("backend/src/engine/bookings.ts"), /on conflict \(booking_id\) do nothing/);
});
