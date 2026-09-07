import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("merchant schema is additive, unique, and append-only", () => {
  const sql = read("migrations/0015_darmelk_merchant.sql");
  assert.match(sql, /merchant_bundles/);
  assert.match(sql, /merchant_bundle_purchases/);
  assert.match(sql, /merchants/);
  assert.match(sql, /merchant_credit_ledger/);
  assert.match(sql, /merchant_payment_requests/);
  assert.match(sql, /merchant_gift_fulfillments/);
  assert.match(sql, /merchant_credit_ledger_idempotency_unique/);
  assert.match(sql, /merchant_payment_requests_open_booking_unique/);
  assert.match(sql, /merchant_bundle/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /drop column/i);
  assert.doesNotMatch(sql, /commission_ledger/);
  assert.doesNotMatch(sql, /booking_snapshots/);
  assert.doesNotMatch(sql, /leadership_reward/);
  assert.doesNotMatch(sql, /set merchant balance/i);
});

test("engine keeps purchased and bonus credit separate and blocks overspend", () => {
  const engine = read("backend/src/engine/merchant.ts");
  assert.match(engine, /purchased_credit_issued/);
  assert.match(engine, /bonus_credit_issued/);
  assert.match(engine, /booking_payment_reserved/);
  assert.match(engine, /booking_payment_settled/);
  assert.match(engine, /reservation_released/);
  assert.match(engine, /admin_adjustment/);
  assert.match(engine, /termsAccepted !== true/);
  assert.match(engine, /on conflict \(idempotency_key\) do nothing/);
  assert.match(engine, /status = 'active'/);
  assert.match(engine, /available \+ \$2 >= 0/);
  assert.match(engine, /Insufficient Merchant Credit/);
  assert.match(engine, /requireActive/);
  assert.doesNotMatch(engine, /Set Merchant Balance/);
  assert.doesNotMatch(engine, /Marchant/);
  assert.doesNotMatch(engine, /Promotion Management/);
  assert.doesNotMatch(engine, /postCommissionsForBooking/);
});

test("Pay by Merchant is a payment rail and does not post commission on approval", () => {
  const bookings = read("backend/src/engine/bookings.ts");
  const router = read("backend/src/router.ts");
  const payments = read("backend/src/engine/payments.ts");
  assert.match(bookings, /settleMerchantPaymentForBooking/);
  assert.match(bookings, /releaseMerchantPaymentForBooking/);
  assert.match(bookings, /reverseMerchantPaymentForBooking/);
  assert.match(bookings, /postCommissionsForBooking/);
  assert.match(router, /bookingHasApprovedMerchantPayment/);
  assert.match(router, /confirmMerchantPurchase/);
  assert.match(router, /merchant_bundle/);
  assert.match(router, /\/api\/bookings\/:id\/merchant-pay/);
  assert.match(payments, /merchant_bundle/);
  assert.doesNotMatch(read("backend/src/engine/merchant.ts"), /COMMISSION_RATES/);
});

test("user and admin screens use Merchant naming", () => {
  assert.match(read("src/components/layout/app-shell.tsx"), /Become a Merchant/);
  assert.match(read("src/components/layout/app-shell.tsx"), /merchant\?\.status === "active" \? "Merchant"/);
  assert.match(read("src/components/layout/admin-shell.tsx"), /Merchant Management/);
  assert.match(read("src/components/payment-form.tsx"), /Pay by Merchant/);
  assert.match(read("src/routes/app/merchant.tsx"), /Become a Merchant/);
  assert.match(read("src/routes/app/merchant.tsx"), /Your Merchant User ID/);
  assert.match(read("src/routes/admin/merchant.index.tsx"), /Merchant Management/);
  assert.doesNotMatch(read("src/routes/app/merchant.tsx"), /Marchant/);
  assert.doesNotMatch(read("src/routes/admin/merchant.accounts.\$userId.tsx"), /Set Merchant Balance/);
});

test("existing commission, leadership, career, and booking rules remain intact", () => {
  assert.match(read("backend/src/engine/commissions.ts"), /1: 0.1/);
  assert.match(read("backend/src/engine/commissions.ts"), /2: 0.08/);
  assert.match(read("backend/src/engine/commissions.ts"), /3: 0.06/);
  assert.match(read("backend/src/engine/commissions.ts"), /4: 0.04/);
  assert.match(read("backend/src/engine/commissions.ts"), /5: 0.02/);
  assert.match(read("backend/src/engine/leadership.ts"), /TIER_25K = 25_000/);
  assert.match(read("backend/src/engine/leadership.ts"), /CYCLE_MONTHS = 12/);
  assert.match(read("backend/src/engine/bookings.ts"), /on conflict \(booking_id\) do nothing/);
  assert.match(read("src/components/layout/app-shell.tsx"), /Leadership Reward/);
  assert.match(read("src/routes/admin/career.index.tsx"), /Career Management/);
  assert.match(read("src/components/layout/site-footer.tsx"), /to="\/career"/);
  assert.match(read("src/components/landing/landing-page.tsx"), /<span>Explore Property Opportunities<\/span>/);
  assert.doesNotMatch(read("backend/src/engine/leadership.ts"), /Merchant Credit/);
  assert.doesNotMatch(read("backend/src/engine/activation.ts"), /merchant_bundle/);
});
