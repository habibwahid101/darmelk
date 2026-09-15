import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("General account is free and is not forced into Growth activation", () => {
  const login = read("src/routes/login.tsx");
  const overview = read("src/routes/app/index.tsx");
  const activation = read("src/routes/app/activation.tsx");
  const shell = read("src/components/layout/app-shell.tsx");
  assert.match(login, /A Darmelk account is free/);
  assert.match(login, /Referral ID \(Optional\)/);
  assert.doesNotMatch(login, /Growth Program/);
  assert.match(overview, /if \(!inGrowth\)/);
  const general = overview.slice(overview.indexOf("if (!inGrowth)"), overview.indexOf("Your property, progress, and financial activity"));
  assert.doesNotMatch(general, /Activate Your Darmelk ID/);
  assert.doesNotMatch(general, /Account inactive/);
  assert.doesNotMatch(general, /Pay BDT 1,000 to activate your Darmelk account/);
  assert.match(general, /Join Growth Program/);
  assert.match(activation, /Navigate to="\/growth-program"/);
  assert.doesNotMatch(shell.slice(shell.indexOf("GENERAL_PRIMARY"), shell.indexOf("GROWTH_PRIMARY")), /Activation/);
});

test("Growth Program Activation fee, duration, and methods stay BDT 1,000 / year", () => {
  const engine = read("backend/src/engine/activation.ts");
  const page = read("src/routes/app/activation.tsx");
  const form = read("src/components/payment-form.tsx");
  assert.match(engine, /const ACTIVATION_FEE = 1000/);
  assert.match(engine, /const YEAR_MS = 365 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(page, /const ACTIVATION_FEE = 1000/);
  assert.match(page, /Growth Program Activation/);
  assert.match(page, /PaymentForm targetType="activation"/);
  assert.match(page, /bKash, Nagad, or Darmelk Bank/);
  assert.doesNotMatch(page, /Pay by Merchant/);
  assert.match(form, /Darmelk Bank/);
  assert.match(engine, /growth_referral_required/);
  assert.match(engine, /acceptGrowthTerms/);
});

test("server-side Terms architecture is versioned, auditable, and immutable", () => {
  const sql = read("migrations/0019_darmelk_consents.sql");
  const terms = read("backend/src/engine/terms.ts");
  const router = read("backend/src/router.ts");
  assert.match(sql, /create table if not exists "user_consents"/);
  assert.match(sql, /GROWTH_PROGRAM_TERMS/);
  assert.match(sql, /GROWTH_ACTIVATION_TERMS/);
  assert.match(sql, /unique \("user_id", "document_key", "document_version", "context", "reference_key"\)/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /update annual_activations/i);
  assert.match(terms, /version: "1"/);
  assert.match(terms, /on conflict \(user_id, document_key, document_version, context, reference_key\)/);
  assert.match(terms, /do nothing/);
  assert.doesNotMatch(terms, /update user_consents/i);
  assert.match(router, /app\.get\("\/api\/terms"/);
  assert.match(router, /recordConsents\(client, userId, \{[\s\S]*GENERAL_TERMS[\s\S]*PRIVACY_POLICY/);
  assert.match(read("src/routes/login.tsx"), /Privacy Policy/);
  assert.match(read("src/routes/login.tsx"), /to="\/privacy"/);
  assert.match(read("src/routes/login.tsx"), /Terms & Conditions/);
});

test("Growth activation requires sponsor and current Terms, and does not auto-activate", () => {
  const engine = read("backend/src/engine/activation.ts");
  const router = read("backend/src/router.ts");
  const smoke = read("backend/src/smoke-test.ts");
  const payments = read("backend/src/engine/payments.ts");
  assert.match(engine, /sponsor_user_id &&[\s\S]*role !== "admin"/);
  assert.match(engine, /activation_status !== "expired"/);
  assert.match(engine, /requireCurrentConsents/);
  assert.match(engine, /GROWTH_PROGRAM_TERMS/);
  assert.match(engine, /GROWTH_ACTIVATION_TERMS/);
  assert.match(engine, /status = 'pending'/);
  assert.match(router, /approveActivation\(client, result.target_id, adminId\)/);
  assert.match(payments, /targetType === "activation" && method === "merchant"/);
  assert.match(smoke, /acceptGrowthTerms: true/);
  assert.match(smoke, /sponsorless general account cannot request Growth Program Activation/);
  assert.match(smoke, /Growth activation without current Terms is rejected/);
  assert.match(smoke, /crafted Growth activation Merchant payment is rejected/);
  assert.match(smoke, /expired Growth member without a sponsor can renew the existing activation period/);
  assert.match(smoke, /activation payment has no property booking or commission effect/);
});

test("Growth privilege guards keep booking gated without blocking marketplace", () => {
  const bookings = read("backend/src/engine/bookings.ts");
  const withdrawals = read("backend/src/engine/withdrawals.ts");
  const members = read("backend/src/engine/members.ts");
  const details = read("src/routes/properties.$slug.tsx");
  assert.match(members, /export async function requireActiveGrowthProgram/);
  assert.match(bookings, /requireActiveGrowthProgram/);
  assert.match(bookings, /Growth Program activation is required before booking/);
  assert.match(withdrawals, /Growth Program activation is required to withdraw earnings/);
  assert.match(details, /Request to Book/);
  assert.doesNotMatch(details, /PaymentForm/);
});

test("Batch 05 payment routes and historical engines remain", () => {
  const payments = read("backend/src/engine/payments.ts");
  const form = read("src/components/payment-form.tsx");
  const book = read("src/routes/app/book.$slug.tsx");
  const network = read("backend/src/engine/network.ts");
  const commissions = read("backend/src/engine/commissions.ts");
  const merchant = read("backend/src/engine/merchant.ts");
  const promotions = read("backend/src/engine/promotions.ts");
  const inventory = read("backend/src/engine/inventory.ts");
  assert.match(payments, /targetType === "booking" && method !== "bank"/);
  assert.match(form, /allowMerchant = targetType === "booking"/);
  assert.match(book, /Pay via Darmelk Bank or Pay by Merchant/);
  assert.match(network, /PERSONAL_SPONSOR_TARGET = 3/);
  assert.match(commissions, /1: 0\.1/);
  assert.match(merchant, /approveMerchantPaymentRequest/);
  assert.match(promotions, /evaluatePromotionsForConfirmedBooking/);
  assert.match(inventory, /consumeInventoryForConfirmation/);
  const files = readdirSync(join(root, "migrations")).filter((name) => name.endsWith(".sql") && name.startsWith("001"));
  assert.ok(files.includes("0019_darmelk_consents.sql"));
  assert.equal(files.filter((name) => name.startsWith("002")).length, 0);
});

test("Terms copy stays Darmelk-only and does not invent earnings", () => {
  const terms = read("backend/src/engine/terms.ts");
  assert.doesNotMatch(terms, /Link Mate/);
  assert.doesNotMatch(terms, /Welfrise|TrueHire|EvidEstate|Jomio/);
  assert.doesNotMatch(terms, /9-level|nine-level/i);
  assert.doesNotMatch(terms, /11,000|11000/);
  assert.doesNotMatch(terms, /Turbo package/i);
  assert.match(terms, /does not guarantee income/i);
  assert.match(terms, /BDT 1,000 per year/);
  assert.match(terms, /3×5/);
  assert.match(terms, /Level 1 10%/);
});
