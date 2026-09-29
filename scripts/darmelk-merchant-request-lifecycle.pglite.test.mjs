import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "backend/package.json"));
const esbuild = require("esbuild");
const read = (rel) => readFileSync(join(root, rel), "utf8");

async function loadEngines() {
  const dir = mkdtempSync(join(tmpdir(), "darmelk-mpr-"));
  const outfile = join(dir, "engines.mjs");
  await esbuild.build({
    stdin: {
      contents: `
        export * as merchant from ${JSON.stringify(join(root, "backend/src/engine/merchant.ts"))};
        export * as bookings from ${JSON.stringify(join(root, "backend/src/engine/bookings.ts"))};
      `,
      resolveDir: join(root, "backend/src"),
      sourcefile: "mpr-entry.ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    packages: "external",
    logLevel: "silent",
  });
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(dir, { recursive: true, force: true });
  return mod;
}

async function applyMigrations(db) {
  const files = readdirSync(join(root, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    await db.exec(readFileSync(join(root, "migrations", name), "utf8"));
  }
}

async function count(db, sql, params = []) {
  const { rows } = await db.query(sql, params);
  return Number(rows[0]?.n ?? 0);
}

test("merchant request UI returns and renders the persisted status", () => {
  const form = read("src/components/payment-form.tsx");
  const book = read("src/routes/app/book.$slug.tsx");
  const detail = read("src/routes/app/bookings.$id.tsx");
  const merchantPage = read("src/routes/app/merchant.tsx");
  const engine = read("backend/src/engine/merchant.ts");
  const create = engine.slice(
    engine.indexOf("export async function createMerchantPaymentRequest"),
    engine.indexOf("export async function createMerchantActivationPaymentRequest"),
  );
  const approve = engine.slice(
    engine.indexOf("export async function approveMerchantPaymentRequest"),
    engine.indexOf("export async function declineMerchantPaymentRequest"),
  );
  assert.match(form, /Pending Merchant Approval/);
  assert.match(form, /Payment request has been submitted successfully\./);
  assert.match(form, /Your payment request has already been submitted\./);
  assert.match(form, /alreadyOpen: created\.alreadyOpen === true/);
  assert.match(book, /MERCHANT_REQUEST_SUBMITTED/);
  assert.match(book, /MERCHANT_REQUEST_ALREADY_SUBMITTED/);
  assert.match(book, /MerchantRequestStatus/);
  assert.match(detail, /error\.status === 404/);
  assert.match(detail, /Could not load this booking/);
  assert.match(detail, /MerchantRequestStatus/);
  assert.match(merchantPage, /merchantRequestStatusLabel/);
  assert.match(merchantPage, /request\.status === "pending"/);
  assert.doesNotMatch(create, /join offers/);
  assert.match(create, /from bookings/);
  assert.match(create, /markRequest\(/);
  const activationApprove = approve.slice(0, approve.indexOf("select status from bookings"));
  const bookingApprove = approve.slice(approve.indexOf("select status from bookings"));
  assert.match(activationApprove, /completeMerchantFundedActivation/);
  assert.match(engine, /const \{ approveActivation \} = await import\("\.\/activation\.js"\)/);
  assert.match(engine, /const \{ confirmBooking \} = await import\("\.\/bookings\.js"\)/);
  assert.match(bookingApprove, /completeMerchantFundedBooking/);
  assert.match(bookingApprove, /assertRailAvailable\(client, "booking", "merchant"\)/);
  assert.doesNotMatch(bookingApprove, /activateBooking|consumeInventoryForConfirmation|evaluatePromotions|postCommissions|approveActivation|completeMerchantFundedActivation/);
  assert.doesNotMatch(engine, /evaluatePromotionsForConfirmedBooking/);
  assert.match(read("backend/src/engine/bookings.ts"), /await settleMerchantPaymentForBooking\(client, bookingId\)/);
  assert.match(read("backend/src/engine/activation.ts"), /await settleMerchantPaymentForActivation\(client, activationId\)/);
  const referral = read("src/components/referral-share.tsx");
  assert.match(referral, /Copy code/);
  assert.match(referral, /Copy link/);
  assert.match(referral, /referralLinkFor\(code, REFERRAL_ORIGIN\)/);
  assert.match(read("src/lib/referral.ts"), /https:\/\/darmelk.com/);
  assert.doesNotMatch(referral, /navigator\.share|Share referral link/);
  assert.match(read("src/routes/app/network.tsx"), /ReferralShareCard/);
  assert.match(read("src/routes/app/settings.tsx"), /ReferralShareCard/);
  assert.match(read("src/routes/admin/bookings.tsx"), /not auto-completed/);
  assert.match(read("src/routes/admin/activation.tsx"), /not auto-completed/);
  assert.doesNotMatch(read("src/routes/admin/bookings.tsx"), /Confirm Merchant payment/);
  assert.doesNotMatch(read("src/routes/admin/activation.tsx"), /Confirm Merchant payment/);
  assert.match(read("src/routes/admin/bookings.tsx"), /Activate/);
  assert.match(read("src/components/payment-form.tsx"), /Merchant approval confirmed this booking/);
  assert.match(book, /does not wait for Darmelk/);
  assert.match(read("src/routes/join.$code.tsx"), /ref: String\(params\.code \?\? ""\)\.trim\(\)\.toUpperCase\(\)/);
});

test("PGlite: merchant payment request lifecycle", async () => {
  const { merchant, bookings } = await loadEngines();
  const db = new PGlite();
  await applyMigrations(db);
  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('user_customer', 'Customer One', 'customer@example.com', true, now(), now()),
      ('user_merchant', 'Merchant One', 'merchant@example.com', true, now(), now()),
      ('user_other', 'Merchant Two', 'other@example.com', true, now(), now()),
      ('user_stranger', 'Stranger', 'stranger@example.com', true, now(), now()),
      ('user_admin', 'Admin', 'admin@example.com', true, now(), now());
    insert into members (user_id, referral_code, role, onboarding_complete, activation_status) values
      ('user_customer', 'DM-CUST01', 'member', true, 'active'),
      ('user_merchant', 'DM-MERCH1', 'member', true, 'active'),
      ('user_other', 'DM-MERCH2', 'member', true, 'active'),
      ('user_stranger', 'DM-STRAN1', 'member', true, 'active'),
      ('user_admin', 'DM-ADMIN1', 'admin', true, 'active');
    insert into merchants (user_id, status, available, purchased_issued, activated_at) values
      ('user_merchant', 'active', 200000, 200000, now()),
      ('user_other', 'active', 200000, 200000, now());
    insert into bookings (id, user_id, offer_slug, retail_value, booking_amount, qualification_benefit, commission_eligible_amount)
    values
      ('bk_life_ok', 'user_customer', 'five-star-hotel-share', 1000000, 50000, 0, 50000),
      ('bk_life_decline', 'user_customer', 'five-star-hotel-share', 1000000, 50000, 0, 50000),
      ('bk_life_off', 'user_customer', 'five-star-hotel-share', 1000000, 50000, 0, 50000),
      ('bk_life_orphan', 'user_customer', 'five-star-hotel-share', 1000000, 50000, 0, 50000);
    insert into annual_activations (id, user_id, amount, period_start, period_end, status)
    values ('act_life', 'user_customer', 1000, now(), now() + interval '1 year', 'pending');
  `);

  await assert.rejects(
    () => merchant.createMerchantPaymentRequest(db, "user_customer", "bk_missing", "user_merchant", { acceptMerchantTerms: true }),
    (err) => err.status === 404 && err.message === "Booking not found",
  );
  await assert.rejects(
    () => merchant.createMerchantPaymentRequest(db, "user_stranger", "bk_life_ok", "user_merchant", { acceptMerchantTerms: true }),
    (err) => err.status === 404 && err.message === "Booking not found",
  );

  const created = await merchant.createMerchantPaymentRequest(db, "user_customer", "bk_life_ok", "user_merchant", {
    acceptMerchantTerms: true,
  });
  assert.equal(created.status, "pending");
  assert.equal(created.purpose, "growth_booking");
  assert.equal(created.customer_user_id, "user_customer");
  assert.equal(created.merchant_user_id, "user_merchant");
  assert.equal(created.booking_id, "bk_life_ok");
  assert.equal(Number(created.amount), 50000);
  assert.equal(created.customer_name, "Customer One");
  assert.equal(created.merchant_name, "Merchant One");
  assert.ok(created.offer_title);

  const again = await merchant.createMerchantPaymentRequest(db, "user_customer", " bk_life_ok ", "user_merchant", {
    acceptMerchantTerms: true,
  });
  assert.equal(again.id, created.id);
  assert.equal(again.alreadyOpen, true);
  assert.equal(created.alreadyOpen, false);
  assert.equal(await count(db, `select count(*)::int as n from merchant_payment_requests where booking_id = 'bk_life_ok'`), 1);

  const intended = await merchant.listMerchantDashboard(db, "user_merchant");
  const other = await merchant.listMerchantDashboard(db, "user_other");
  assert.ok(intended.incomingRequests.some((row) => row.id === created.id && row.status === "pending"));
  assert.equal(other.incomingRequests.some((row) => row.id === created.id), false);

  const approved = await merchant.approveMerchantPaymentRequest(db, "user_merchant", created.id);
  assert.equal(approved.status, "settled");
  const bookingAfterApprove = await db.query(`select status from bookings where id = 'bk_life_ok'`);
  assert.equal(bookingAfterApprove.rows[0].status, "confirmed");
  assert.equal(await count(db, `select count(*)::int as n from offer_inventory_events where booking_id = 'bk_life_ok' and event_type = 'consume'`), 1);
  assert.equal(await count(db, `select count(*)::int as n from commission_ledger where source_booking_id = 'bk_life_ok'`), 0);
  assert.equal(await count(db, `select count(*)::int as n from booking_snapshots where booking_id = 'bk_life_ok'`), 0);
  const reserved = await db.query(`select available, reserved, settled from merchants where user_id = 'user_merchant'`);
  assert.equal(Number(reserved.rows[0].available), 150000);
  assert.equal(Number(reserved.rows[0].reserved), 0);
  assert.equal(Number(reserved.rows[0].settled), 50000);
  await assert.rejects(
    () => merchant.approveMerchantPaymentRequest(db, "user_other", created.id),
    (err) => err.status === 403,
  );
  const approvedAgain = await merchant.approveMerchantPaymentRequest(db, "user_merchant", created.id);
  assert.equal(approvedAgain.status, "settled");
  assert.equal(await count(db, `select count(*)::int as n from offer_inventory_events where booking_id = 'bk_life_ok' and event_type = 'consume'`), 1);
  assert.equal(await count(db, `select count(*)::int as n from commission_ledger where source_booking_id = 'bk_life_ok'`), 0);
  assert.equal(await count(db, `select count(*)::int as n from merchant_credit_ledger where payment_request_id = $1`, [created.id]), 2);
  const afterBookingRepeat = await db.query(`select available, reserved, settled from merchants where user_id = 'user_merchant'`);
  assert.equal(Number(afterBookingRepeat.rows[0].available), 150000);
  assert.equal(Number(afterBookingRepeat.rows[0].reserved), 0);
  assert.equal(Number(afterBookingRepeat.rows[0].settled), 50000);
  await assert.rejects(
    () => bookings.confirmBooking(db, "bk_life_ok", "user_admin"),
    (err) => err.status === 409,
  );

  await db.exec(`
    insert into bookings (id, user_id, offer_slug, retail_value, booking_amount, qualification_benefit, commission_eligible_amount)
    values
      ('bk_life_short', 'user_customer', 'five-star-hotel-share', 1000000, 50000, 0, 50000),
      ('bk_life_rail', 'user_customer', 'five-star-hotel-share', 1000000, 50000, 0, 50000);
  `);
  const short = await merchant.createMerchantPaymentRequest(db, "user_customer", "bk_life_short", "user_merchant", {
    acceptMerchantTerms: true,
  });
  await db.query(`update merchants set available = 0 where user_id = 'user_merchant'`);
  await assert.rejects(
    () => merchant.approveMerchantPaymentRequest(db, "user_merchant", short.id),
    (err) => err.code === "insufficient_credit",
  );
  assert.equal((await db.query(`select status from bookings where id = 'bk_life_short'`)).rows[0].status, "pending");
  assert.equal((await db.query(`select status from merchant_payment_requests where id = $1`, [short.id])).rows[0].status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from offer_inventory_events where booking_id = 'bk_life_short'`), 0);
  assert.equal(await count(db, `select count(*)::int as n from merchant_credit_ledger where payment_request_id = $1`, [short.id]), 0);
  await db.query(`update merchants set available = 150000 where user_id = 'user_merchant'`);

  const rail = await merchant.createMerchantPaymentRequest(db, "user_customer", "bk_life_rail", "user_merchant", {
    acceptMerchantTerms: true,
  });
  await db.query(`update payment_method_settings set enabled = false where context = 'growth_booking' and method = 'merchant'`);
  await assert.rejects(
    () => merchant.approveMerchantPaymentRequest(db, "user_merchant", rail.id),
    (err) => err.code === "payment_method_not_allowed",
  );
  assert.equal((await db.query(`select status from bookings where id = 'bk_life_rail'`)).rows[0].status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from merchant_credit_ledger where payment_request_id = $1`, [rail.id]), 0);
  assert.equal(await count(db, `select count(*)::int as n from offer_inventory_events where booking_id = 'bk_life_rail'`), 0);
  await db.query(`update payment_method_settings set enabled = true where context = 'growth_booking' and method = 'merchant'`);
  const balancesAfterGuards = await db.query(`select available, reserved, settled from merchants where user_id = 'user_merchant'`);
  assert.equal(Number(balancesAfterGuards.rows[0].available), 150000);
  assert.equal(Number(balancesAfterGuards.rows[0].reserved), 0);
  assert.equal(Number(balancesAfterGuards.rows[0].settled), 50000);

  const declined = await merchant.createMerchantPaymentRequest(db, "user_customer", "bk_life_decline", "user_merchant", {
    acceptMerchantTerms: true,
  });
  const declineResult = await merchant.declineMerchantPaymentRequest(db, "user_merchant", declined.id);
  assert.equal(declineResult.status, "declined");
  assert.equal((await db.query(`select status from bookings where id = 'bk_life_decline'`)).rows[0].status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from offer_inventory_events where booking_id = 'bk_life_decline'`), 0);
  assert.equal(await count(db, `select count(*)::int as n from commission_ledger where source_booking_id = 'bk_life_decline'`), 0);
  const afterDecline = await db.query(`select available, reserved, settled from merchants where user_id = 'user_merchant'`);
  assert.equal(Number(afterDecline.rows[0].available), 150000);
  assert.equal(Number(afterDecline.rows[0].reserved), 0);
  assert.equal(Number(afterDecline.rows[0].settled), 50000);
  assert.equal(await count(db, `select count(*)::int as n from merchant_payment_requests where id = $1 and status = 'declined'`, [declined.id]), 1);
  const replacement = await merchant.createMerchantPaymentRequest(db, "user_customer", "bk_life_decline", "user_merchant", {
    acceptMerchantTerms: true,
  });
  assert.notEqual(replacement.id, declined.id);
  assert.equal(replacement.status, "pending");

  await db.query(
    `update payment_method_settings set enabled = false where context = 'growth_booking' and method = 'merchant'`,
  );
  await assert.rejects(
    () => merchant.createMerchantPaymentRequest(db, "user_customer", "bk_life_off", "user_merchant", { acceptMerchantTerms: true }),
    (err) => err.code === "payment_method_not_allowed",
  );
  assert.equal(await count(db, `select count(*)::int as n from merchant_payment_requests where booking_id = 'bk_life_off'`), 0);

  await db.exec(`alter table bookings drop constraint if exists bookings_offer_slug_fkey`);
  await db.query(`update bookings set offer_slug = 'missing-offer' where id = 'bk_life_orphan'`);
  await db.query(
    `update payment_method_settings set enabled = true where context = 'growth_booking' and method = 'merchant'`,
  );
  const orphan = await merchant.createMerchantPaymentRequest(db, "user_customer", "bk_life_orphan", "user_merchant", {
    acceptMerchantTerms: true,
  });
  assert.equal(orphan.status, "pending");
  assert.equal(orphan.offer_title, "missing-offer");
  assert.equal(orphan.offer_slug, "missing-offer");

  await db.query(
    `update payment_method_settings set enabled = true where context = 'growth_activation' and method = 'merchant'`,
  );
  await db.query(`update members set activation_status = 'pending' where user_id = 'user_customer'`);
  await db.query(
    `insert into annual_activations (id, user_id, amount, period_start, period_end, status)
     values ('act_decline', 'user_customer', 1000, now(), now() + interval '1 year', 'pending'),
            ('act_short', 'user_customer', 1000, now(), now() + interval '1 year', 'pending'),
            ('act_off', 'user_customer', 1000, now(), now() + interval '1 year', 'pending')`,
  );
  const bookingsBeforeActivation = await count(db, `select count(*)::int as n from bookings`);
  const inventoryBeforeActivation = await count(db, `select count(*)::int as n from offer_inventory_events`);
  const commissionsBeforeActivation = await count(db, `select count(*)::int as n from commission_ledger`);

  const declinedActivation = await merchant.createMerchantActivationPaymentRequest(db, "user_customer", "act_decline", "user_merchant", {
    acceptMerchantTerms: true,
  });
  assert.equal((await merchant.listMerchantDashboard(db, "user_other")).incomingRequests.some((row) => row.id === declinedActivation.id), false);
  await assert.rejects(
    () => merchant.approveMerchantPaymentRequest(db, "user_other", declinedActivation.id),
    (err) => err.status === 403,
  );
  const declinedActivationResult = await merchant.declineMerchantPaymentRequest(db, "user_merchant", declinedActivation.id);
  assert.equal(declinedActivationResult.status, "declined");
  assert.equal((await db.query(`select status from annual_activations where id = 'act_decline'`)).rows[0].status, "pending");
  assert.equal((await db.query(`select activation_status from members where user_id = 'user_customer'`)).rows[0].activation_status, "pending");
  assert.equal(Number((await db.query(`select available from merchants where user_id = 'user_merchant'`)).rows[0].available), 150000);

  const shortRequest = await merchant.createMerchantActivationPaymentRequest(db, "user_customer", "act_short", "user_merchant", {
    acceptMerchantTerms: true,
  });
  await db.query(`update merchants set available = 0 where user_id = 'user_merchant'`);
  await assert.rejects(
    () => merchant.approveMerchantPaymentRequest(db, "user_merchant", shortRequest.id),
    (err) => err.code === "insufficient_credit",
  );
  assert.equal((await db.query(`select status from annual_activations where id = 'act_short'`)).rows[0].status, "pending");
  assert.equal((await db.query(`select status from merchant_payment_requests where id = $1`, [shortRequest.id])).rows[0].status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from merchant_credit_ledger where payment_request_id = $1`, [shortRequest.id]), 0);
  await db.query(`update merchants set available = 150000 where user_id = 'user_merchant'`);

  const disabledRequest = await merchant.createMerchantActivationPaymentRequest(db, "user_customer", "act_off", "user_merchant", {
    acceptMerchantTerms: true,
  });
  await db.query(
    `update payment_method_settings set enabled = false where context = 'growth_activation' and method = 'merchant'`,
  );
  await assert.rejects(
    () => merchant.approveMerchantPaymentRequest(db, "user_merchant", disabledRequest.id),
    (err) => err.code === "payment_method_not_allowed",
  );
  assert.equal((await db.query(`select status from annual_activations where id = 'act_off'`)).rows[0].status, "pending");
  assert.equal(await count(db, `select count(*)::int as n from merchant_credit_ledger where payment_request_id = $1`, [disabledRequest.id]), 0);
  await db.query(
    `insert into annual_activations (id, user_id, amount, period_start, period_end, status)
     values ('act_blocked', 'user_customer', 1000, now(), now() + interval '1 year', 'pending')`,
  );
  await assert.rejects(
    () => merchant.createMerchantActivationPaymentRequest(db, "user_customer", "act_blocked", "user_merchant", { acceptMerchantTerms: true }),
    (err) => err.code === "payment_method_not_allowed",
  );
  await db.query(
    `update payment_method_settings set enabled = true where context = 'growth_activation' and method = 'merchant'`,
  );

  const activation = await merchant.createMerchantActivationPaymentRequest(db, "user_customer", "act_life", "user_merchant", {
    acceptMerchantTerms: true,
  });
  assert.equal(activation.purpose, "growth_activation");
  assert.equal(activation.booking_id, null);
  assert.equal(activation.activation_id, "act_life");
  assert.equal(activation.alreadyOpen, false);
  const activationAgain = await merchant.createMerchantActivationPaymentRequest(db, "user_customer", "act_life", "user_merchant", {
    acceptMerchantTerms: true,
  });
  assert.equal(activationAgain.id, activation.id);
  assert.equal(activationAgain.alreadyOpen, true);
  const activationDash = await merchant.listMerchantDashboard(db, "user_merchant");
  assert.ok(activationDash.incomingRequests.some((row) => row.id === activation.id && row.status === "pending"));
  assert.equal((await merchant.listMerchantDashboard(db, "user_other")).incomingRequests.some((row) => row.id === activation.id), false);
  const activationApproved = await merchant.approveMerchantPaymentRequest(db, "user_merchant", activation.id);
  assert.equal(activationApproved.status, "settled");
  assert.equal((await db.query(`select status from annual_activations where id = 'act_life'`)).rows[0].status, "active");
  assert.equal((await db.query(`select activation_status from members where user_id = 'user_customer'`)).rows[0].activation_status, "active");
  const afterActivation = await db.query(`select available, reserved, settled from merchants where user_id = 'user_merchant'`);
  assert.equal(Number(afterActivation.rows[0].available), 149000);
  assert.equal(Number(afterActivation.rows[0].reserved), 0);
  assert.equal(Number(afterActivation.rows[0].settled), 51000);
  const activationRepeat = await merchant.approveMerchantPaymentRequest(db, "user_merchant", activation.id);
  assert.equal(activationRepeat.status, "settled");
  const afterRepeat = await db.query(`select available, reserved, settled from merchants where user_id = 'user_merchant'`);
  assert.equal(Number(afterRepeat.rows[0].available), 149000);
  assert.equal(Number(afterRepeat.rows[0].settled), 51000);
  assert.equal(await count(db, `select count(*)::int as n from merchant_credit_ledger where payment_request_id = $1`, [activation.id]), 2);
  assert.equal(await count(db, `select count(*)::int as n from bookings`), bookingsBeforeActivation);
  assert.equal(await count(db, `select count(*)::int as n from offer_inventory_events`), inventoryBeforeActivation);
  assert.equal(await count(db, `select count(*)::int as n from commission_ledger`), commissionsBeforeActivation);
});
