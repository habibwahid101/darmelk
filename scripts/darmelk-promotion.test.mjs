import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("promotion schema is additive, unique, and append-only", () => {
  const sql = read("migrations/0016_darmelk_promotion.sql");
  assert.match(sql, /create table if not exists "promotions"/);
  assert.match(sql, /promotion_offers/);
  assert.match(sql, /promotion_rewards/);
  assert.match(sql, /promotion_qualifications/);
  assert.match(sql, /promotion_reward_fulfillments/);
  assert.match(sql, /promotion_reward_events/);
  assert.match(sql, /promotion_qualifications_user_unique/);
  assert.match(sql, /promotion_qualifications_booking_unique/);
  assert.match(sql, /check \("end_at" > "start_at"\)/);
  assert.match(sql, /'draft', 'published', 'closed'/);
  assert.match(sql, /'eligible', 'approved', 'fulfilled', 'cancelled', 'reversed'/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /drop column/i);
  assert.doesNotMatch(sql, /commission_ledger/);
  assert.doesNotMatch(sql, /booking_snapshots/);
  assert.doesNotMatch(sql, /leadership_reward/);
  assert.doesNotMatch(sql, /merchant_credit_ledger/);
  assert.doesNotMatch(sql, /withdrawals/);
});

test("engine qualifies only from confirmed bookings inside the server window", () => {
  const engine = read("backend/src/engine/promotions.ts");
  const bookings = read("backend/src/engine/bookings.ts");
  assert.match(engine, /evaluatePromotionsForConfirmedBooking/);
  assert.match(engine, /on conflict \(promotion_id, user_id\) do nothing/);
  assert.match(engine, /confirmed_at/);
  assert.match(engine, /status !== "confirmed" && booking.status !== "activated"/);
  assert.match(engine, /confirmedAt.getTime\(\) < start.getTime\(\)/);
  assert.match(engine, /confirmedAt.getTime\(\) >= end.getTime\(\)/);
  assert.match(engine, /campaignMatchesOffer/);
  assert.match(engine, /terms_snapshot/);
  assert.match(engine, /rewards_snapshot/);
  assert.match(engine, /Qualified from confirmed booking/);
  assert.match(engine, /ALLOWED_TRANSITIONS/);
  assert.match(engine, /A reason is required to cancel or reverse a reward/);
  assert.doesNotMatch(engine, /Mark User Qualified/);
  assert.doesNotMatch(engine, /postCommissionsForBooking/);
  assert.doesNotMatch(engine, /COMMISSION_RATES/);
  assert.doesNotMatch(engine, /lockWithdrawalFunds/);
  assert.doesNotMatch(engine, /settleMerchantPaymentForBooking/);
  assert.match(bookings, /evaluatePromotionsForConfirmedBooking/);
  assert.match(bookings, /reversePromotionRewardsForBooking/);
  assert.match(bookings, /postCommissionsForBooking/);
});

test("APIs are role-protected and do not add a cash rail", () => {
  const router = read("backend/src/router.ts");
  assert.match(router, /\/api\/me\/promotions/);
  assert.match(router, /\/api\/promotions/);
  assert.match(router, /\/api\/admin\/promotions\/overview/);
  assert.match(router, /requireAdmin/);
  assert.match(router, /setFulfillmentStatus/);
  assert.match(router, /createPromotion/);
  assert.doesNotMatch(router, /Mark User Qualified/);
  assert.doesNotMatch(router, /promotions\/.*\/qualify/);
  assert.doesNotMatch(router, /\/api\/admin\/promotions\/qualify/);
});

test("user dashboard and admin screens use Promotion Management naming", () => {
  assert.match(read("src/components/layout/admin-shell.tsx"), /Promotion Management/);
  assert.match(read("src/routes/admin/promotions.index.tsx"), /Promotion Management/);
  assert.match(read("src/routes/app/index.tsx"), /DashboardPromotions/);
  assert.match(read("src/components/promotions/dashboard-promotions.tsx"), /Current promotion/);
  assert.match(read("src/components/promotions/dashboard-promotions.tsx"), /More promotions/);
  assert.match(read("src/components/promotions/countdown.tsx"), /Days/);
  assert.match(read("src/components/promotions/countdown.tsx"), /Hours/);
  assert.match(read("src/components/promotions/countdown.tsx"), /Minutes/);
  assert.match(read("src/components/promotions/countdown.tsx"), /Seconds/);
  assert.match(read("src/components/promotions/countdown.tsx"), /serverNow/);
  assert.match(read("src/routes/app/promotions.\$id.tsx"), /Not Yet Qualified/);
  assert.match(read("src/routes/app/promotions.\$id.tsx"), /Reward Fulfilled/);
  assert.match(read("src/routes/admin/promotions.qualifications.tsx"), /no unaudited override that marks a member qualified/);
  assert.doesNotMatch(read("src/routes/admin/promotions.qualifications.tsx"), /Mark User Qualified/);
  assert.doesNotMatch(read("src/components/promotions/countdown.tsx"), /casino/i);
});

test("existing commission, leadership, merchant, career, and booking rules remain intact", () => {
  assert.match(read("backend/src/engine/commissions.ts"), /1: 0.1/);
  assert.match(read("backend/src/engine/commissions.ts"), /2: 0.08/);
  assert.match(read("backend/src/engine/commissions.ts"), /3: 0.06/);
  assert.match(read("backend/src/engine/commissions.ts"), /4: 0.04/);
  assert.match(read("backend/src/engine/commissions.ts"), /5: 0.02/);
  assert.match(read("backend/src/engine/leadership.ts"), /TIER_25K = 25_000/);
  assert.match(read("backend/src/engine/leadership.ts"), /CYCLE_MONTHS = 12/);
  assert.match(read("backend/src/engine/bookings.ts"), /on conflict \(booking_id\) do nothing/);
  assert.match(read("backend/src/engine/bookings.ts"), /settleMerchantPaymentForBooking/);
  assert.match(read("backend/src/engine/activation.ts"), /1000/);
  assert.match(read("src/components/layout/app-shell.tsx"), /Leadership Reward/);
  assert.match(read("src/components/layout/app-shell.tsx"), /Become a Merchant/);
  assert.match(read("src/components/layout/admin-shell.tsx"), /Merchant Management/);
  assert.match(read("src/components/layout/admin-shell.tsx"), /Career Management/);
  assert.match(read("src/routes/admin/career.index.tsx"), /Career Management/);
  assert.match(read("src/components/layout/site-footer.tsx"), /to="\/career"/);
  assert.match(read("src/components/landing/landing-page.tsx"), /<span>Explore Property Opportunities<\/span>/);
  assert.doesNotMatch(read("backend/src/engine/promotions.ts"), /Merchant Credit/);
  assert.doesNotMatch(read("backend/src/engine/promotions.ts"), /Leadership Reward/);
});
