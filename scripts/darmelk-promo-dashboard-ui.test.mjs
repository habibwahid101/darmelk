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

test("uploaded promotion banners keep their own shape on every view", () => {
  const banner = read("src/components/promotions/promotion-banner.tsx");
  const dashboard = read("src/components/promotions/dashboard-promotions.tsx");
  const index = read("src/routes/app/promotions.index.tsx");
  const detail = read("src/routes/app/promotions.$id.tsx");
  const preview = read("src/routes/admin/promotions.campaigns.$id.preview.tsx");
  assert.match(banner, /h-auto w-full/);
  assert.match(banner, /object-contain/);
  assert.doesNotMatch(banner, /object-cover/);
  assert.doesNotMatch(banner, /aspect-\[/);
  assert.doesNotMatch(banner, /max-h-/);
  for (const src of [dashboard, index, detail, preview]) {
    assert.match(src, /PromotionBanner/);
    assert.doesNotMatch(src, /object-cover/);
    assert.doesNotMatch(src, /max-h-36/);
    assert.doesNotMatch(src, /aspect-\[16\/9\]/);
  }
  assert.match(dashboard, /overflow-hidden p-0/);
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
