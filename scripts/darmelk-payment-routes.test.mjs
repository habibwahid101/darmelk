import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("Growth booking UI offers Darmelk Bank and Merchant only by default", () => {
  const form = read("src/components/payment-form.tsx");
  const book = read("src/routes/app/book.$slug.tsx");
  const migration = read("migrations/0020_darmelk_payment_settings.sql");
  assert.match(form, /Pay via Darmelk Bank/);
  assert.match(form, /Pay by Merchant/);
  assert.match(form, /role="radiogroup"/);
  assert.match(form, /aria-label="Payment method"/);
  assert.match(form, /Copy payment account/);
  assert.match(form, /api\.paymentOptions\(targetType\)/);
  assert.match(form, /receivingAccountId/);
  assert.match(book, /PaymentForm targetType="booking"/);
  assert.match(book, /describePaymentOptions/);
  assert.match(migration, /'growth_booking', 'bank', true/);
  assert.match(migration, /'growth_booking', 'mfs', false/);
  assert.match(migration, /'growth_booking', 'merchant', true/);
  assert.doesNotMatch(form, /Pay to Vendor/);
  assert.doesNotMatch(book, /Pay to Vendor/);
});

test("server rejects disallowed Growth booking payment methods from admin configuration", () => {
  const payments = read("backend/src/engine/payments.ts");
  const settings = read("backend/src/engine/payment-settings.ts");
  const router = read("backend/src/router.ts");
  const client = read("src/lib/api-client.ts");
  assert.match(settings, /export async function assertRailAvailable/);
  assert.match(settings, /export async function listLegacyDestinations/);
  assert.match(settings, /export async function resolveReceivingAccount/);
  assert.match(settings, /payment_method_not_allowed/);
  assert.match(settings, /unsupported_payment_method/);
  assert.match(settings, /This payment method is currently unavailable for this transaction/);
  assert.match(payments, /resolveReceivingAccount/);
  assert.match(payments, /receiving_account_id/);
  assert.match(router, /listLegacyDestinations\(client, c\.req\.query\("target"\)\)/);
  assert.match(router, /getEffectivePaymentOptions/);
  assert.match(client, /\/api\/payment-destinations/);
  assert.match(client, /\/api\/payment-options/);
  assert.match(client, /target=/);
  const statements = payments
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(statements, /drop table/i);
  assert.doesNotMatch(payments, /alter table/i);
});

test("manual bank approval still uses the central booking confirmation path", () => {
  const router = read("backend/src/router.ts");
  const bookings = read("backend/src/engine/bookings.ts");
  const smoke = read("backend/src/smoke-test.ts");
  const approve = router.slice(router.indexOf('app.post("/api/admin/payments/:id/:decision"'));
  assert.match(approve, /await confirmBooking\(client, result.target_id, adminId\)/);
  assert.match(approve, /await activateBooking\(client, result.target_id\)/);
  assert.match(bookings, /consumeInventoryForConfirmation/);
  assert.match(smoke, /targetType === "booking" \? "bank" : "bkash"/);
  assert.match(smoke, /crafted Growth booking bKash payment is rejected/);
  assert.match(smoke, /manual bank approval consumes shared inventory exactly once/);
});

test("Merchant approval remains a rail and does not confirm or consume", () => {
  const merchant = read("backend/src/engine/merchant.ts");
  const bookings = read("backend/src/engine/bookings.ts");
  const approve = merchant.slice(merchant.indexOf("export async function approveMerchantPaymentRequest"));
  assert.doesNotMatch(approve.slice(0, 2500), /confirmBooking|activateBooking|consumeInventoryForConfirmation|postCommissionsForBooking|evaluatePromotions/);
  assert.doesNotMatch(approve, /approveActivation/);
  assert.match(bookings, /settleMerchantPaymentForBooking/);
  assert.match(bookings, /consumeInventoryForConfirmation/);
  assert.match(read("src/components/payment-form.tsx"), /The booking stays pending until Darmelk confirms it/);
});

test("General Marketplace has no direct payment UI and Request to Book is unchanged", () => {
  const detail = read("src/routes/properties.$slug.tsx");
  const form = read("src/components/contact-form.tsx");
  assert.match(detail, /Request to Book/);
  assert.match(detail, /to="\/contact"/);
  assert.doesNotMatch(detail, /PaymentForm/);
  assert.doesNotMatch(detail, /Pay via Darmelk Bank/);
  assert.doesNotMatch(detail, /bKash/);
  assert.doesNotMatch(detail, /Nagad/);
  assert.doesNotMatch(detail, /Pay by Merchant/);
  assert.doesNotMatch(detail, /Pay to Vendor/);
  assert.match(form, /source: "request_to_book"/);
  assert.doesNotMatch(form, /PaymentForm/);
});

test("activation payment methods and fee stay configuration-driven without changing economics", () => {
  const activation = read("backend/src/engine/activation.ts");
  const page = read("src/routes/app/activation.tsx");
  const payments = read("backend/src/engine/payments.ts");
  const migration = read("migrations/0020_darmelk_payment_settings.sql");
  assert.match(activation, /1000/);
  assert.match(page, /const ACTIVATION_FEE = 1000/);
  assert.match(page, /PaymentForm targetType="activation"/);
  assert.match(page, /describePaymentOptions/);
  assert.match(migration, /'growth_activation', 'bank', true/);
  assert.match(migration, /'growth_activation', 'mfs', true/);
  assert.match(migration, /'growth_activation', 'merchant', false/);
  assert.doesNotMatch(activation, /payment_method_not_allowed/);
  assert.match(payments, /bkash: \{ method: "bkash"/);
  assert.match(payments, /nagad: \{ method: "nagad"/);
  assert.match(payments, /Seed documentation only/);
});
