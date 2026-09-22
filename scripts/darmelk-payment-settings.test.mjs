import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("payment settings migration is additive and preserves current production defaults", () => {
  const sql = read("migrations/0020_darmelk_payment_settings.sql");
  assert.match(sql, /payment_method_settings/);
  assert.match(sql, /receiving_accounts/);
  assert.match(sql, /receiving_account_contexts/);
  assert.match(sql, /'growth_activation', 'bank', true/);
  assert.match(sql, /'growth_activation', 'mfs', true/);
  assert.match(sql, /'growth_activation', 'merchant', false/);
  assert.match(sql, /'growth_booking', 'bank', true/);
  assert.match(sql, /'growth_booking', 'mfs', false/);
  assert.match(sql, /'growth_booking', 'merchant', true/);
  assert.match(sql, /rcv_seed_bkash_primary/);
  assert.match(sql, /rcv_seed_nagad_primary/);
  assert.match(sql, /rcv_seed_bank_city/);
  assert.match(sql, /01813212777/);
  assert.match(sql, /1503885023001/);
  assert.match(sql, /add column if not exists "receiving_account_id"/);
  assert.match(sql, /activation_payment_reserved/);
  assert.match(sql, /activation_payment_settled/);
  assert.match(sql, /purpose/);
  assert.match(sql, /activation_id/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /truncate/i);
  assert.doesNotMatch(sql, /delete from payment_submissions/i);
  assert.doesNotMatch(sql, /delete from bookings/i);
  assert.doesNotMatch(sql, /delete from members/i);
});

test("server-authoritative options, snapshot, and admin audit cover the required controls", () => {
  const settings = read("backend/src/engine/payment-settings.ts");
  const payments = read("backend/src/engine/payments.ts");
  const router = read("backend/src/router.ts");
  const form = read("src/components/payment-form.tsx");
  assert.match(settings, /getEffectivePaymentOptions/);
  assert.match(settings, /assertRailAvailable/);
  assert.match(settings, /resolveReceivingAccount/);
  assert.match(settings, /snapshotReceivingAccount/);
  assert.match(settings, /setPaymentMethodEnabled/);
  assert.match(settings, /createReceivingAccount/);
  assert.match(settings, /updateReceivingAccount/);
  assert.match(settings, /archiveReceivingAccount/);
  assert.match(settings, /deleteUnusedReceivingAccount/);
  assert.match(settings, /receiving_account_required/);
  assert.match(settings, /receiving_account_unavailable/);
  assert.match(settings, /payment_method.enabled/);
  assert.match(settings, /payment_method.disabled/);
  assert.match(settings, /receiving_account.created/);
  assert.match(settings, /receiving_account.updated/);
  assert.match(settings, /receiving_account.enabled/);
  assert.match(settings, /receiving_account.disabled/);
  assert.match(settings, /receiving_account.archived/);
  assert.match(settings, /receiving_account.context_changed/);
  assert.match(settings, /receiving_account.order_changed/);
  assert.match(settings, /logAdminAction/);
  assert.match(payments, /resolveReceivingAccount/);
  assert.match(payments, /receiving_account_id/);
  assert.match(payments, /destination_snapshot/);
  assert.match(router, /\/api\/payment-options/);
  assert.match(router, /\/api\/admin\/payment-settings/);
  assert.match(router, /requireAdmin/);
  assert.match(form, /receivingAccountId: selected.id/);
  assert.match(form, /method\.available/);
});

test("direct API bypasses are rejected by receiving-account validation", () => {
  const settings = read("backend/src/engine/payment-settings.ts");
  const payments = read("backend/src/engine/payments.ts");
  const merchant = read("backend/src/engine/merchant.ts");
  assert.match(settings, /archived_at \|\| !account.enabled/);
  assert.match(settings, /!account.contexts.includes\(context\)/);
  assert.match(settings, /requestedMethod !== expected && requestedMethod !== account.method/);
  assert.match(settings, /unsupported_payment_method/);
  assert.match(payments, /toLowerCase\(\) === "merchant"/);
  assert.match(merchant, /assertRailAvailable\(client, "booking", "merchant"\)/);
  assert.match(merchant, /assertRailAvailable\(client, "activation", "merchant"\)/);
  assert.match(read("backend/src/router.ts"), /receivingAccountId: body.receivingAccountId/);
});

test("merchant remains a rail: booking reserve-only, activation uses approveActivation", () => {
  const merchant = read("backend/src/engine/merchant.ts");
  const activation = read("backend/src/engine/activation.ts");
  const router = read("backend/src/router.ts");
  const approve = merchant.slice(merchant.indexOf("export async function approveMerchantPaymentRequest"));
  assert.doesNotMatch(approve, /confirmBooking|activateBooking|consumeInventoryForConfirmation|postCommissionsForBooking|evaluatePromotions|approveActivation/);
  assert.match(merchant, /activation_payment_reserved/);
  assert.match(merchant, /activation_payment_settled/);
  assert.match(merchant, /createMerchantActivationPaymentRequest/);
  assert.match(merchant, /settleMerchantPaymentForActivation/);
  assert.match(activation, /settleMerchantPaymentForActivation/);
  assert.match(activation, /releaseMerchantPaymentForActivation/);
  assert.match(activation, /const ACTIVATION_FEE = 1000/);
  assert.match(router, /activationHasApprovedMerchantPayment/);
  assert.match(router, /\/api\/activation\/:id\/merchant-pay/);
  assert.doesNotMatch(merchant, /COMMISSION_RATES/);
});

test("admin payment settings UI and member form stay on Darmelk design", () => {
  const page = read("src/routes/admin/payment-settings.tsx");
  const shell = read("src/components/layout/admin-shell.tsx");
  const form = read("src/components/payment-form.tsx");
  const payments = read("src/routes/admin/payments.tsx");
  assert.match(page, /createFileRoute\("\/admin\/payment-settings"\)/);
  assert.match(page, /Payment availability/);
  assert.match(page, /MFS accounts/);
  assert.match(page, /Bank accounts/);
  assert.match(page, /Activation/);
  assert.match(page, /Booking/);
  assert.match(page, /displayOrder/);
  assert.match(page, /Archive/);
  assert.match(shell, /\/admin\/payment-settings/);
  assert.match(form, /Pay by MFS/);
  assert.match(form, /aria-label="Receiving account"/);
  assert.match(payments, /destination_snapshot/);
  assert.match(read("src/routeTree.gen.ts"), /id: '\/payment-settings'/);
});

test("foundation, commission, RtB, and commercial economics stay untouched by this feature", () => {
  assert.match(read("backend/src/engine/commissions.ts"), /1: 0\.1/);
  assert.match(read("backend/src/engine/commissions.ts"), /2: 0\.08/);
  assert.match(read("backend/src/engine/commissions.ts"), /3: 0\.06/);
  assert.match(read("backend/src/engine/commissions.ts"), /4: 0\.04/);
  assert.match(read("backend/src/engine/commissions.ts"), /5: 0\.02/);
  assert.match(read("backend/src/engine/activation.ts"), /const ACTIVATION_FEE = 1000/);
  assert.match(read("src/routes/properties.$slug.tsx"), /Request to Book/);
  assert.doesNotMatch(read("src/routes/properties.$slug.tsx"), /PaymentForm/);
  const sql = read("migrations/0020_darmelk_payment_settings.sql")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sql, /createFoundationNetwork/);
  assert.doesNotMatch(sql, /update members/);
  assert.doesNotMatch(sql, /update annual_activations/);
  assert.doesNotMatch(read("backend/src/engine/payment-settings.ts"), /createFoundationNetwork/);
});
