import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("Growth booking UI offers Darmelk Bank and Merchant only", () => {
  const form = read("src/components/payment-form.tsx");
  const book = read("src/routes/app/book.$slug.tsx");
  assert.match(form, /Pay via Darmelk Bank/);
  assert.match(form, /Pay by Merchant/);
  assert.match(form, /allowMerchant = targetType === "booking"/);
  assert.match(form, /allowMerchant \? "bank" : "bkash"/);
  assert.match(form, /role="radiogroup"/);
  assert.match(form, /aria-label="Payment method"/);
  assert.match(form, /Copy payment account/);
  assert.match(book, /Pay via Darmelk Bank or Pay by Merchant/);
  assert.match(book, /PaymentForm targetType="booking"/);
  assert.doesNotMatch(form, /Pay to Vendor/);
  assert.doesNotMatch(book, /bKash/);
  assert.doesNotMatch(book, /Nagad/);
  assert.doesNotMatch(book, /Pay to Vendor/);
});

test("server rejects disallowed Growth booking payment methods", () => {
  const payments = read("backend/src/engine/payments.ts");
  const router = read("backend/src/router.ts");
  const client = read("src/lib/api-client.ts");
  assert.match(payments, /export function assertPaymentMethodForTarget/);
  assert.match(payments, /export function destinationsForTarget/);
  assert.match(payments, /targetType === "booking" && method !== "bank"/);
  assert.match(payments, /payment_method_not_allowed/);
  assert.match(payments, /unsupported_payment_method/);
  assert.match(router, /destinationsForTarget\(c\.req\.query\("target"\)\)/);
  assert.match(client, /\/api\/payment-destinations/);
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

test("activation payment methods and fee stay untouched", () => {
  const activation = read("backend/src/engine/activation.ts");
  const page = read("src/routes/app/activation.tsx");
  const payments = read("backend/src/engine/payments.ts");
  assert.match(activation, /1000/);
  assert.match(page, /const ACTIVATION_FEE = 1000/);
  assert.match(page, /PaymentForm targetType="activation"/);
  assert.doesNotMatch(page, /Pay by Merchant/);
  assert.doesNotMatch(activation, /payment_method_not_allowed/);
  assert.match(payments, /bkash: \{ method: "bkash"/);
  assert.match(payments, /nagad: \{ method: "nagad"/);
  const destFn = payments.slice(payments.indexOf("export function destinationsForTarget"));
  assert.match(destFn, /if \(target === "booking"\)/);
});
