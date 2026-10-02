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
const OPEN_PAYMENT = "This Merchant bundle purchase already has a payment submission in progress.";

async function loadEngines() {
  const dir = mkdtempSync(join(tmpdir(), "darmelk-repeat-"));
  const outfile = join(dir, "engines.mjs");
  await esbuild.build({
    stdin: {
      contents: `
        export * as merchant from ${JSON.stringify(join(root, "backend/src/engine/merchant.ts"))};
        export * as payments from ${JSON.stringify(join(root, "backend/src/engine/payments.ts"))};
      `,
      resolveDir: join(root, "backend/src"),
      sourcefile: "repeat-entry.ts",
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

function proof(referenceId) {
  return {
    paymentMethod: "bkash",
    receivingAccountId: "rcv_seed_bkash_primary",
    referenceId,
    proofFilename: "receipt.png",
    proofMime: "image/png",
    proofBase64: "iVBORw0KGgo=",
  };
}

test("merchant dashboard keeps every active bundle available for repeat purchase", () => {
  const page = read("src/routes/app/merchant.tsx");
  const dash = page.slice(page.indexOf("function MerchantDashboard"), page.indexOf("function labelEntry"));
  const become = page.slice(page.indexOf("function BecomeAMerchant"), page.indexOf("function MerchantDashboard"));
  const actions = page.slice(page.indexOf("function bundlePurchaseAction"), page.indexOf("function MerchantPage"));
  assert.match(become, /Become a Merchant/);
  assert.match(become, /Return to overview/);
  assert.match(dash, /Your Merchant User ID/);
  assert.match(dash, /Available Merchant Bundles/);
  assert.match(dash, /bundles\.map\(\(bundle\)/);
  assert.doesNotMatch(dash, /bundles\.filter/);
  assert.ok(dash.indexOf("Available Merchant Credit") < dash.indexOf("Available Merchant Bundles"));
  assert.ok(dash.indexOf("Available Merchant Bundles") < dash.indexOf("Payment Requests"));
  assert.ok(dash.indexOf("Payment Requests") < dash.indexOf("Recent Activity"));
  assert.ok(dash.indexOf("Recent Activity") < dash.indexOf("Bundle Purchase History"));
  assert.ok(dash.indexOf("Bundle Purchase History") < dash.indexOf("Gift Tracking"));
  assert.match(actions, /Buy Bundle/);
  assert.match(actions, /Buy Again/);
  assert.match(actions, /purchase\.status === "confirmed"/);
  assert.match(actions, /Continue Payment/);
  assert.match(actions, /Retry Payment/);
  assert.match(actions, /Payment Submitted/);
  assert.match(actions, /Under Review/);
  assert.match(dash, /Continue to Payment/);
  assert.match(dash, /I have read and accept these Terms & Conditions for this Merchant bundle\./);
  assert.match(dash, /Total Merchant Credit/);
  assert.match(dash, /bundle\.purchased_credit \+ bundle\.bonus_credit/);
  assert.match(dash, /reviewBundle\.purchased_credit \+ reviewBundle\.bonus_credit/);
  assert.match(dash, /api\.startMerchantPurchase\(reviewBundle\.id, true, crypto\.randomUUID\(\)\)/);
  assert.match(dash, /targetType="merchant_bundle"/);
  assert.doesNotMatch(dash, /to="\/app"/);
  assert.match(dash, /Purchase \{purchase\.id\}/);
  assert.match(dash, /Purchase \{gift\.purchase_id\}/);
  assert.match(dash, /gift\.quantity\} × \{gift\.gift_label\}/);
  assert.match(page, /function bundlePurchaseAction/);
  assert.match(read("backend/src/engine/merchant.ts"), /where user_id = \$1 and bundle_id = \$2 and status = 'pending'/);
  assert.match(read("backend/src/engine/payments.ts"), /This Merchant bundle purchase already has a payment submission in progress\./);
  assert.match(read("src/routes/admin/merchant.index.tsx"), /Merchant Management/);
  const migrations = readdirSync(join(root, "migrations")).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(migrations.at(-1), "0022_darmelk_booking_terms_admin.sql");
});

test("PGlite: repeat bundle purchases stay separate for credit, gifts, payments, and snapshots", async () => {
  const { merchant, payments } = await loadEngines();
  const db = new PGlite();
  await applyMigrations(db);
  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('user_admin', 'Admin', 'repeat-admin@example.com', true, now(), now()),
      ('user_m', 'Merchant', 'repeat-merchant@example.com', true, now(), now());
    insert into members (user_id, referral_code, role, onboarding_complete, activation_status) values
      ('user_admin', 'DM-RPTADM', 'admin', true, 'active'),
      ('user_m', 'DM-RPTMER', 'member', true, 'active');
  `);

  const bundleA = await merchant.createBundle(db, {
    name: "Darmelk Elite",
    description: "Primary merchant credit bundle",
    purchaseAmount: 500000,
    purchasedCredit: 500000,
    bonusCredit: 50000,
    gifts: [{ label: "Merchant Business Tab", quantity: 1 }],
    terms: "Elite terms version one",
    status: "active",
  });
  const bundleB = await merchant.createBundle(db, {
    name: "Darmelk Growth Pack",
    description: "Second active bundle",
    purchaseAmount: 100000,
    purchasedCredit: 100000,
    bonusCredit: 10000,
    gifts: [{ label: "Growth Pack Gift", quantity: 1 }],
    terms: "Growth pack terms",
    status: "active",
  });
  const bundleC = await merchant.createBundle(db, {
    name: "Retired Pack",
    description: "Will be inactivated",
    purchaseAmount: 20000,
    purchasedCredit: 20000,
    bonusCredit: 0,
    gifts: [{ label: "Retired Gift", quantity: 1 }],
    terms: "Retired terms",
    status: "active",
  });
  const bundleD = await merchant.createBundle(db, {
    name: "Draft Pack",
    description: "Not published",
    purchaseAmount: 10000,
    purchasedCredit: 10000,
    bonusCredit: 0,
    gifts: [],
    terms: "Draft terms",
    status: "draft",
  });

  await merchant.setBundleStatus(db, bundleC.id, "inactive");
  const visible = await merchant.listPublicBundles(db);
  assert.deepEqual(visible.map((bundle) => bundle.id).sort(), [bundleA.id, bundleB.id].sort());
  assert.equal(visible.some((bundle) => bundle.id === bundleC.id || bundle.id === bundleD.id), false);
  assert.equal(visible.every((bundle) => bundle.status === "active"), true);

  const first = await merchant.startBundlePurchase(db, "user_m", { bundleId: bundleA.id, termsAccepted: true });
  const reused = await merchant.startBundlePurchase(db, "user_m", { bundleId: bundleA.id, termsAccepted: true });
  assert.equal(reused.id, first.id);
  assert.equal(await count(db, `select count(*)::int as n from merchant_bundle_purchases where user_id = 'user_m' and bundle_id = $1 and status = 'pending'`, [bundleA.id]), 1);

  const other = await merchant.startBundlePurchase(db, "user_m", { bundleId: bundleB.id, termsAccepted: true });
  assert.notEqual(other.id, first.id);
  assert.equal(other.bundle_id, bundleB.id);

  const submitted = await payments.createPaymentSubmission(db, "user_m", {
    targetType: "merchant_bundle",
    targetId: first.id,
    ...proof("ELITE-1"),
  });
  assert.equal(submitted.target_id, first.id);
  assert.equal(submitted.status, "submitted");
  await assert.rejects(
    () => payments.createPaymentSubmission(db, "user_m", { targetType: "merchant_bundle", targetId: first.id, ...proof("ELITE-2") }),
    (err) => err.status === 409 && err.message === OPEN_PAYMENT,
  );
  await payments.markPaymentUnderReview(db, submitted.id, "user_admin");
  await assert.rejects(
    () => payments.createPaymentSubmission(db, "user_m", { targetType: "merchant_bundle", targetId: first.id, ...proof("ELITE-3") }),
    (err) => err.status === 409 && err.message === OPEN_PAYMENT,
  );
  await payments.finalizePayment(db, submitted.id, "rejected", "user_admin", "Proof unreadable");
  const retried = await payments.createPaymentSubmission(db, "user_m", {
    targetType: "merchant_bundle",
    targetId: first.id,
    ...proof("ELITE-RETRY"),
  });
  assert.equal(retried.target_id, first.id);
  assert.notEqual(retried.id, submitted.id);
  await payments.markPaymentUnderReview(db, retried.id, "user_admin");
  await payments.finalizePayment(db, retried.id, "approved", "user_admin");
  await assert.rejects(
    () => payments.createPaymentSubmission(db, "user_m", { targetType: "merchant_bundle", targetId: first.id, ...proof("ELITE-4") }),
    (err) => err.status === 409 && err.message === OPEN_PAYMENT,
  );

  const confirmed = await merchant.confirmMerchantPurchase(db, first.id, "user_admin");
  assert.equal(confirmed.status, "confirmed");
  const again = await merchant.confirmMerchantPurchase(db, first.id, "user_admin");
  assert.equal(again.id, confirmed.id);
  assert.equal(await count(db, `select count(*)::int as n from merchant_credit_ledger where bundle_purchase_id = $1`, [first.id]), 2);
  assert.equal(await count(db, `select count(*)::int as n from merchant_gift_fulfillments where purchase_id = $1`, [first.id]), 1);
  const gift1 = await db.query(`select gift_label, quantity from merchant_gift_fulfillments where purchase_id = $1`, [first.id]);
  assert.equal(gift1.rows[0].gift_label, "Merchant Business Tab");
  assert.equal(Number(gift1.rows[0].quantity), 1);

  const frozen = {
    id: confirmed.id,
    bundle_version: confirmed.bundle_version,
    purchase_amount: confirmed.purchase_amount,
    purchased_credit: confirmed.purchased_credit,
    bonus_credit: confirmed.bonus_credit,
    terms_version: confirmed.terms_version,
    terms_snapshot: confirmed.terms_snapshot,
    gifts: confirmed.gifts_snapshot.map((gift) => gift.label),
  };
  assert.equal(frozen.purchase_amount, 500000);
  assert.equal(frozen.purchased_credit, 500000);
  assert.equal(frozen.bonus_credit, 50000);
  assert.equal(frozen.terms_version, 1);
  assert.equal(frozen.bundle_version, 1);

  await merchant.updateBundle(db, bundleA.id, {
    purchaseAmount: 600000,
    purchasedCredit: 600000,
    bonusCredit: 70000,
    gifts: [{ label: "Merchant Welcome Kit", quantity: 1 }],
    terms: "Elite terms version two",
  });

  const second = await merchant.startBundlePurchase(db, "user_m", { bundleId: bundleA.id, termsAccepted: true });
  assert.notEqual(second.id, first.id);
  assert.equal(second.purchase_amount, 600000);
  assert.equal(second.purchased_credit, 600000);
  assert.equal(second.bonus_credit, 70000);
  assert.equal(second.terms_version, 2);
  assert.equal(second.terms_snapshot, "Elite terms version two");
  assert.equal(second.gifts_snapshot[0].label, "Merchant Welcome Kit");
  assert.equal(second.bundle_version, 2);
  const secondPay = await payments.createPaymentSubmission(db, "user_m", {
    targetType: "merchant_bundle",
    targetId: second.id,
    ...proof("ELITE-SECOND"),
  });
  assert.equal(secondPay.target_id, second.id);
  assert.notEqual(secondPay.target_id, first.id);

  const confirmedSecond = await merchant.confirmMerchantPurchase(db, second.id, "user_admin");
  await merchant.confirmMerchantPurchase(db, second.id, "user_admin");
  await merchant.confirmMerchantPurchase(db, first.id, "user_admin");
  assert.equal(await count(db, `select count(*)::int as n from merchant_gift_fulfillments where purchase_id = $1`, [first.id]), 1);
  assert.equal(await count(db, `select count(*)::int as n from merchant_gift_fulfillments where purchase_id = $1`, [second.id]), 1);
  assert.notEqual(first.id, second.id);
  const gift2 = await db.query(`select gift_label from merchant_gift_fulfillments where purchase_id = $1`, [second.id]);
  assert.equal(gift2.rows[0].gift_label, "Merchant Welcome Kit");

  const stillFirst = await db.query(
    `select bundle_version, purchase_amount, purchased_credit, bonus_credit, terms_version, terms_snapshot, gifts_snapshot
       from merchant_bundle_purchases where id = $1`,
    [first.id],
  );
  const row = stillFirst.rows[0];
  const gifts = typeof row.gifts_snapshot === "string" ? JSON.parse(row.gifts_snapshot) : row.gifts_snapshot;
  assert.equal(Number(row.bundle_version), frozen.bundle_version);
  assert.equal(Number(row.purchase_amount), frozen.purchase_amount);
  assert.equal(Number(row.purchased_credit), frozen.purchased_credit);
  assert.equal(Number(row.bonus_credit), frozen.bonus_credit);
  assert.equal(Number(row.terms_version), frozen.terms_version);
  assert.equal(row.terms_snapshot, frozen.terms_snapshot);
  assert.equal(gifts[0].label, "Merchant Business Tab");

  const ledger1 = await db.query(
    `select entry_type, amount from merchant_credit_ledger where bundle_purchase_id = $1 order by entry_type`,
    [first.id],
  );
  assert.deepEqual(
    ledger1.rows.map((entry) => [entry.entry_type, Number(entry.amount)]).sort(),
    [
      ["bonus_credit_issued", 50000],
      ["purchased_credit_issued", 500000],
    ],
  );
  const ledger2 = await db.query(
    `select entry_type, amount from merchant_credit_ledger where bundle_purchase_id = $1 order by entry_type`,
    [second.id],
  );
  assert.deepEqual(
    ledger2.rows.map((entry) => [entry.entry_type, Number(entry.amount)]).sort(),
    [
      ["bonus_credit_issued", 70000],
      ["purchased_credit_issued", 600000],
    ],
  );
  const account = await db.query(`select purchased_issued, bonus_issued from merchants where user_id = 'user_m'`);
  assert.equal(Number(account.rows[0].purchased_issued), 1100000);
  assert.equal(Number(account.rows[0].bonus_issued), 120000);

  const rejected = await merchant.startBundlePurchase(db, "user_m", { bundleId: bundleA.id, termsAccepted: true });
  assert.notEqual(rejected.id, second.id);
  await merchant.rejectMerchantPurchase(db, rejected.id);
  const afterReject = await merchant.startBundlePurchase(db, "user_m", { bundleId: bundleA.id, termsAccepted: true });
  assert.notEqual(afterReject.id, rejected.id);
  assert.equal(afterReject.status, "pending");
  await merchant.rejectMerchantPurchase(db, other.id);

  await merchant.setBundleStatus(db, bundleC.id, "active");
  const retiredPurchase = await merchant.startBundlePurchase(db, "user_m", { bundleId: bundleC.id, termsAccepted: true });
  await merchant.confirmMerchantPurchase(db, retiredPurchase.id, "user_admin");
  await merchant.setBundleStatus(db, bundleC.id, "inactive");
  await assert.rejects(
    () => merchant.startBundlePurchase(db, "user_m", { bundleId: bundleC.id, termsAccepted: true }),
    (err) => err.status === 404,
  );
  await assert.rejects(
    () => merchant.startBundlePurchase(db, "user_m", { bundleId: bundleD.id, termsAccepted: true }),
    (err) => err.status === 404,
  );

  const dashboard = await merchant.listMerchantDashboard(db, "user_m");
  assert.deepEqual(dashboard.bundles.map((bundle) => bundle.name).sort(), ["Darmelk Elite", "Darmelk Growth Pack"]);
  assert.equal(dashboard.bundles.some((bundle) => bundle.status !== "active"), false);
  assert.equal(dashboard.purchases.some((purchase) => purchase.id === first.id), true);
  assert.equal(dashboard.purchases.some((purchase) => purchase.id === confirmedSecond.id), true);
  assert.equal(dashboard.purchases.some((purchase) => purchase.id === retiredPurchase.id && purchase.bundle_name === "Retired Pack"), true);
  assert.equal(dashboard.purchases.filter((purchase) => purchase.bundle_id === bundleA.id).length >= 3, true);
  const eliteGifts = dashboard.gifts.filter((gift) => gift.gift_label === "Merchant Business Tab" || gift.gift_label === "Merchant Welcome Kit");
  assert.equal(eliteGifts.length, 2);
  assert.equal(new Set(eliteGifts.map((gift) => gift.purchase_id)).size, 2);
  assert.equal(dashboard.gifts.every((gift) => gift.purchase_id && gift.bundle_name), true);
});
