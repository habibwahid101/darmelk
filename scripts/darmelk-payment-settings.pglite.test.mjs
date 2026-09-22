import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "backend/package.json"));
const esbuild = require("esbuild");

async function loadEngines() {
  const dir = mkdtempSync(join(tmpdir(), "darmelk-pay-engine-"));
  const outfile = join(dir, "engines.mjs");
  await esbuild.build({
    stdin: {
      contents: `
        export * as settings from ${JSON.stringify(join(root, "backend/src/engine/payment-settings.ts"))};
        export * as payments from ${JSON.stringify(join(root, "backend/src/engine/payments.ts"))};
      `,
      resolveDir: join(root, "backend/src"),
      sourcefile: "pglite-entry.ts",
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

test("PGlite: defaults, toggles, dynamic accounts, snapshot, and API bypasses", async () => {
  const { settings, payments } = await loadEngines();
  const db = new PGlite();
  await applyMigrations(db);
  await db.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('user_admin', 'Admin', 'admin@example.com', true, now(), now()),
            ('user_member', 'Member', 'member@example.com', true, now(), now())`,
  );
  await db.query(
    `insert into members (user_id, referral_code, role, onboarding_complete, activation_status)
     values ('user_admin', 'DM-ADMIN1', 'admin', true, 'active'),
            ('user_member', 'DM-MEMBER1', 'member', true, 'pending')`,
  );

  const activation = await settings.getEffectivePaymentOptions(db, "activation");
  const booking = await settings.getEffectivePaymentOptions(db, "booking");
  const byMethod = (opts) => Object.fromEntries(opts.methods.map((m) => [m.method, m]));
  const act = byMethod(activation);
  const book = byMethod(booking);
  assert.equal(act.bank?.available, true);
  assert.equal(act.mfs?.available, true);
  assert.equal(act.merchant?.available, false);
  assert.equal(book.bank?.available, true);
  assert.equal(book.mfs?.available, false);
  assert.equal(book.merchant?.available, true);
  assert.equal(act.mfs?.accounts.length, 2);
  assert.equal(book.bank?.accounts.length, 1);

  const destBooking = await settings.listLegacyDestinations(db, "booking");
  assert.equal(destBooking.length, 1);
  assert.equal(destBooking[0]?.method, "bank");
  const destAct = await settings.listLegacyDestinations(db, "activation");
  assert.deepEqual(destAct.map((d) => d.method).sort(), ["bank", "bkash", "nagad"]);

  await assert.rejects(
    () => settings.setPaymentMethodEnabled(db, "user_admin", { context: "growth_booking", method: "mfs", enabled: true }),
    /at least one enabled MFS receiving account/i,
  );

  const extraBkash = await settings.createReceivingAccount(db, "user_admin", {
    method: "mfs",
    provider: "bkash",
    label: "bKash Secondary",
    accountNumber: "01700000001",
    accountHolderName: "Darmelk",
    accountType: "Personal",
    enabled: true,
    displayOrder: 15,
    contexts: ["growth_activation", "growth_booking"],
  });
  const extraNagad = await settings.createReceivingAccount(db, "user_admin", {
    method: "mfs",
    provider: "nagad",
    label: "Nagad Secondary",
    accountNumber: "01700000002",
    accountHolderName: "Darmelk",
    enabled: true,
    displayOrder: 25,
    contexts: ["growth_booking"],
  });
  const extraBank = await settings.createReceivingAccount(db, "user_admin", {
    method: "bank",
    provider: "bank",
    label: "DBBL Main",
    accountNumber: "999999999",
    accountHolderName: "Darmelk",
    bankName: "Dutch-Bangla Bank",
    branch: "Gulshan",
    enabled: true,
    displayOrder: 20,
    contexts: ["growth_booking"],
  });
  await settings.setPaymentMethodEnabled(db, "user_admin", { context: "growth_booking", method: "mfs", enabled: true });
  await settings.setPaymentMethodEnabled(db, "user_admin", { context: "growth_activation", method: "merchant", enabled: true });
  await settings.setPaymentMethodEnabled(db, "user_admin", { context: "growth_booking", method: "bank", enabled: false });

  const actOn = byMethod(await settings.getEffectivePaymentOptions(db, "activation"));
  const bookOn = byMethod(await settings.getEffectivePaymentOptions(db, "booking"));
  assert.equal(actOn.merchant?.available, true);
  assert.equal(bookOn.mfs?.available, true);
  assert.equal(bookOn.bank?.available, false);
  assert.equal(actOn.mfs?.accounts.filter((a) => a.provider === "bkash").length, 2);
  assert.equal(bookOn.mfs?.accounts.some((a) => a.id === extraNagad.id), true);

  await settings.setPaymentMethodEnabled(db, "user_admin", { context: "growth_booking", method: "bank", enabled: true });

  await db.query(
    `insert into annual_activations (id, user_id, amount, period_start, period_end, status)
     values ('act_test', 'user_member', 1000, now(), now() + interval '1 year', 'pending')`,
  );

  const submitted = await payments.createPaymentSubmission(db, "user_member", {
    targetType: "activation",
    targetId: "act_test",
    paymentMethod: "bkash",
    receivingAccountId: extraBkash.id,
    referenceId: "BKASH-1",
    proofFilename: "receipt.png",
    proofMime: "image/png",
    proofBase64: "iVBORw0KGgo=",
  });
  assert.equal(submitted.payment_method, "bkash");
  assert.equal(submitted.destination_snapshot.account_number, "01700000001");
  assert.equal(submitted.receiving_account_id, extraBkash.id);

  await settings.updateReceivingAccount(db, "user_admin", extraBkash.id, {
    accountNumber: "01799999999",
    label: "Changed later",
    contexts: extraBkash.contexts,
  });
  const afterEdit = await db.query(`select destination_snapshot from payment_submissions where id = $1`, [submitted.id]);
  const snap = afterEdit.rows[0]?.destination_snapshot;
  const parsed = typeof snap === "string" ? JSON.parse(snap) : snap;
  assert.equal(parsed.account_number, "01700000001");
  assert.equal(parsed.label, "bKash Secondary");

  await settings.updateReceivingAccount(db, "user_admin", extraBkash.id, {
    enabled: false,
    contexts: extraBkash.contexts,
  });
  const pendingStill = await db.query(`select status from payment_submissions where id = $1`, [submitted.id]);
  assert.equal(pendingStill.rows[0]?.status, "submitted");

  await assert.rejects(
    () =>
      payments.createPaymentSubmission(db, "user_member", {
        targetType: "activation",
        targetId: "act_test",
        paymentMethod: "bkash",
        receivingAccountId: extraBkash.id,
        referenceId: "BKASH-2",
        proofFilename: "receipt.png",
        proofMime: "image/png",
        proofBase64: "iVBORw0KGgo=",
      }),
    /currently unavailable/,
  );
  await assert.rejects(
    () => settings.resolveReceivingAccount(db, { targetType: "activation", receivingAccountId: extraNagad.id, paymentMethod: "nagad" }),
    /currently unavailable/,
  );
  await assert.rejects(
    () => settings.resolveReceivingAccount(db, { targetType: "booking", receivingAccountId: extraBank.id, paymentMethod: "bkash" }),
    /currently unavailable/,
  );
  await assert.rejects(
    () => settings.resolveReceivingAccount(db, { targetType: "activation", receivingAccountId: "rcv_does_not_exist" }),
    /not found/i,
  );
  await assert.rejects(
    () =>
      payments.createPaymentSubmission(db, "user_member", {
        targetType: "activation",
        targetId: "act_test",
        paymentMethod: "merchant",
        referenceId: "X",
        proofFilename: "receipt.png",
        proofMime: "image/png",
        proofBase64: "iVBORw0KGgo=",
      }),
    /currently unavailable/,
  );

  await settings.setPaymentMethodEnabled(db, "user_admin", { context: "growth_activation", method: "bank", enabled: false });
  await assert.rejects(
    () => settings.resolveReceivingAccount(db, { targetType: "activation", paymentMethod: "bank", receivingAccountId: "rcv_seed_bank_city" }),
    /currently unavailable/,
  );

  const archived = await settings.archiveReceivingAccount(db, "user_admin", extraBkash.id);
  assert.ok(archived.archived_at);
  await assert.rejects(() => settings.deleteUnusedReceivingAccount(db, "user_admin", extraBkash.id), /payment history/i);

  const unused = await settings.createReceivingAccount(db, "user_admin", {
    method: "mfs",
    provider: "rocket",
    label: "Rocket unused",
    accountNumber: "01600000000",
    contexts: ["growth_activation"],
  });
  await settings.deleteUnusedReceivingAccount(db, "user_admin", unused.id);

  const audits = await db.query(`select action_type from admin_actions`);
  const types = audits.rows.map((row) => row.action_type);
  assert.ok(types.includes("receiving_account.created"));
  assert.ok(types.includes("receiving_account.archived"));
  assert.ok(types.includes("payment_method.enabled") || types.includes("payment_method.disabled"));

  await db.close();
});
