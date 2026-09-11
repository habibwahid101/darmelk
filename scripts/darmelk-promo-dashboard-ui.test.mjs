import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("dashboard promotion card uses a full-width information / time split", () => {
  const src = read("src/components/promotions/dashboard-promotions.tsx");
  assert.match(src, /md:grid-cols-\[minmax\(0,1\.65fr\)_minmax\(14\.5rem,0\.92fr\)\]/);
  assert.doesNotMatch(src, /minmax\(0,11rem\)/);
  assert.match(src, /Current promotion/);
  assert.match(src, /Time remaining/);
  assert.match(src, /View details/);
  assert.match(src, /More promotions/);
  assert.match(src, /Reward/);
  assert.match(src, /Eligible propert/);
  assert.match(src, /primary\.rewards/);
  assert.match(src, /offer_scope === "all"/);
  assert.match(src, /quantity > 1/);
  assert.match(src, /to="\/app\/promotions\/\$id"/);
  assert.match(src, /w-full/);
  assert.match(src, /text-pretty/);
});

test("countdown stays server-time display with stable digit width", () => {
  const src = read("src/components/promotions/countdown.tsx");
  assert.match(src, /serverNow/);
  assert.match(src, /tabular-nums/);
  assert.match(src, /padStart\(2, "0"\)/);
  assert.match(src, /min-w-\[2ch\]/);
  assert.match(src, /grid-cols-4/);
  assert.match(src, /Days/);
  assert.match(src, /Hours/);
  assert.match(src, /Minutes/);
  assert.match(src, /Seconds/);
  assert.match(src, /This promotion has ended/);
  assert.doesNotMatch(src, /setInterval\(\(\) => .*fetch/);
});

test("promotion engine and other Darmelk rails stay untouched", () => {
  const engine = read("backend/src/engine/promotions.ts");
  const router = read("backend/src/router.ts");
  assert.match(engine, /evaluatePromotionsForConfirmedBooking/);
  assert.match(engine, /on conflict \(promotion_id, user_id\) do nothing/);
  assert.match(router, /requireAdmin/);
  assert.doesNotMatch(read("src/components/promotions/dashboard-promotions.tsx"), /Android Smartphone/);
  assert.doesNotMatch(read("src/components/promotions/dashboard-promotions.tsx"), /Five-Star Hotel Share/);
});
