import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("Growth booking requires Property Booking Terms on the createBooking path", () => {
  const bookings = read("backend/src/engine/bookings.ts");
  const router = read("backend/src/router.ts");
  const page = read("src/routes/app/book.$slug.tsx");
  const client = read("src/lib/api-client.ts");
  const smoke = read("backend/src/smoke-test.ts");
  const createFn = bookings.slice(
    bookings.indexOf("export async function createBooking"),
    bookings.indexOf("export async function confirmBooking"),
  );
  assert.match(createFn, /acceptBookingTerms !== true/);
  assert.match(createFn, /PROPERTY_BOOKING_TERMS/);
  assert.match(createFn, /context: "booking"/);
  assert.match(createFn, /referenceId: booking.id/);
  assert.match(createFn, /requireCurrentConsentFor/);
  assert.match(createFn, /terms_required/);
  assert.match(router, /acceptBookingTerms: body.acceptBookingTerms/);
  assert.match(page, /TermsAccept/);
  assert.match(page, /Property Booking Terms for this booking/);
  assert.match(page, /\/terms\?key=booking/);
  assert.match(page, /disabled=\{pending \|\| !termsReady\}/);
  assert.match(client, /acceptBookingTerms/);
  assert.match(smoke, /Growth booking without Property Booking Terms is rejected/);
  assert.match(smoke, /crafted booking accepted=true without Property Booking Terms is rejected/);
  assert.match(smoke, /prior booking consent does not authorize a later booking/);
  assert.match(smoke, /Darmelk Bank booking payment does not require Merchant Payment Terms/);
  assert.doesNotMatch(createFn.slice(0, 2500), /evaluatePromotionsForConfirmedBooking/);
});

test("Pay by Merchant requires Merchant Payment Terms before request/reserve", () => {
  const merchant = read("backend/src/engine/merchant.ts");
  const router = read("backend/src/router.ts");
  const form = read("src/components/payment-form.tsx");
  const smoke = read("backend/src/smoke-test.ts");
  const createReq = merchant.slice(merchant.indexOf("export async function createMerchantPaymentRequest"));
  const approve = merchant.slice(merchant.indexOf("export async function approveMerchantPaymentRequest"));
  assert.match(createReq, /acceptMerchantTerms !== true/);
  assert.match(createReq, /MERCHANT_PAYMENT_TERMS/);
  assert.match(createReq, /context: "merchant_payment"/);
  assert.match(createReq, /requireCurrentConsentFor/);
  assert.match(router, /acceptMerchantTerms: body.acceptMerchantTerms/);
  assert.match(form, /Merchant Payment Terms/);
  assert.match(form, /\/terms\?key=merchant-payment/);
  assert.match(form, /disabled=\{pending \|\| !merchantTermsReady\}/);
  assert.match(form, /methods.find\(\(method\) => method.method === "merchant"\)\?\.available/);
  assert.doesNotMatch(form.slice(form.indexOf("Submit for review") - 400, form.indexOf("Submit for review")), /Merchant Payment Terms/);
  assert.match(smoke, /Pay by Merchant without Merchant Payment Terms is rejected/);
  assert.match(smoke, /crafted Merchant accepted=true without Merchant Payment Terms is rejected/);
  assert.doesNotMatch(approve.slice(0, 2500), /confirmBooking|activateBooking|consumeInventoryForConfirmation|evaluatePromotions|postCommissions/);
});

test("consent architecture stays additive and other rails stay untouched", () => {
  const terms = read("backend/src/engine/terms.ts");
  const activation = read("backend/src/engine/activation.ts");
  const payments = read("backend/src/engine/payments.ts");
  const promotions = read("backend/src/engine/promotions.ts");
  const inventory = read("backend/src/engine/inventory.ts");
  const details = read("src/routes/properties.$slug.tsx");
  assert.match(terms, /export async function requireCurrentConsentFor/);
  assert.match(terms, /on conflict \(user_id, document_key, document_version, context, reference_key\)/);
  assert.match(terms, /do nothing/);
  assert.match(activation, /GROWTH_PROGRAM_TERMS/);
  assert.match(activation, /1000/);
  assert.doesNotMatch(activation, /PROPERTY_BOOKING_TERMS/);
  assert.doesNotMatch(payments, /MERCHANT_PAYMENT_TERMS/);
  assert.doesNotMatch(promotions, /PROPERTY_BOOKING_TERMS/);
  assert.doesNotMatch(promotions, /recordConsents/);
  assert.match(inventory, /consumeInventoryForConfirmation/);
  assert.match(details, /Request to Book/);
  assert.doesNotMatch(details, /PaymentForm/);
  assert.doesNotMatch(terms, /Link Mate/);
  const files = readdirSync(join(root, "migrations")).filter((name) => name.endsWith(".sql") && name.startsWith("001"));
  assert.ok(files.includes("0019_darmelk_consents.sql"));
  assert.equal(files.filter((name) => name.startsWith("002")).length, 0);
});
