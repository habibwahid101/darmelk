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

function asDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match ? match[1] : String(value);
}

test("property commercial card uses a fixed deadline, installment amount, and location under the title", () => {
  const card = read("src/components/offer-commercial-terms.tsx");
  const details = read("src/routes/properties.$slug.tsx");
  const form = read("src/components/admin/offer-form.tsx");
  const offers = read("src/lib/offers.ts");
  const migration = read("migrations/0021_darmelk_payment_completion_deadline.sql");
  const statements = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.match(card, /Payment Completion Deadline/);
  assert.match(card, /Installment Amount/);
  assert.match(card, /Installment Duration/);
  assert.match(offers, /export function formatCalendarDate/);
  assert.match(offers, /December/);
  assert.doesNotMatch(card, /days after booking/);
  assert.doesNotMatch(card, /Installment plan/);
  assert.doesNotMatch(card, /monthly payments/);
  assert.doesNotMatch(card, /offer\.location/);
  assert.doesNotMatch(card, /Project Location/);
  assert.match(details, /<MapPin/);
  assert.ok(details.indexOf("<h1") < details.indexOf("offer.location"));
  assert.ok(details.indexOf("offer.location") < details.indexOf("<OfferCommercialTerms"));
  assert.match(form, /Project Location/);
  assert.match(form, /Payment Completion Deadline/);
  assert.match(form, /type="date"/);
  assert.match(form, /Installment Amount \(BDT\)/);
  assert.match(form, /Installment Duration \(months\)/);
  assert.doesNotMatch(form, /Full payment deadline \(days\)/);
  assert.doesNotMatch(form, /deadline days/);
  assert.match(migration, /five-star-hotel-share/);
  assert.match(migration, /2028-12-31/);
  assert.match(migration, /add column if not exists "payment_completion_deadline" date/);
  assert.doesNotMatch(statements, /update "bookings"/);
  assert.doesNotMatch(statements, /update "booking_snapshots"/);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /truncate/i);
  assert.doesNotMatch(migration, /delete from/i);
});

test("Growth booking is one review page, then confirm, then the existing payment step", () => {
  const book = read("src/routes/app/book.$slug.tsx");
  const bookings = read("backend/src/engine/bookings.ts");
  const terms = read("backend/src/engine/terms.ts");
  const merchant = read("backend/src/engine/merchant.ts");
  const router = read("backend/src/router.ts");
  assert.match(book, /Confirm Booking/);
  assert.match(book, /Before you confirm/);
  assert.doesNotMatch(book, /What happens next/);
  assert.match(book, /TermsAccept/);
  assert.match(book, /Property Booking Terms for this booking/);
  assert.match(book, /disabled=\{pending \|\| !termsReady\}/);
  assert.match(book, /api\.createBooking\(offer\.slug, crypto\.randomUUID\(\), true\)/);
  assert.ok(book.indexOf("api.createBooking") < book.indexOf('setStep("payment")'));
  assert.match(book, /PaymentForm targetType="booking"/);
  assert.match(book, /does not wait for Darmelk/);
  assert.match(book, /OfferCommercialTerms offer=\{offer\} variant="growth"/);
  assert.doesNotMatch(book, /Continue to summary/);
  assert.doesNotMatch(book, /Booking summary/);
  assert.doesNotMatch(book, /Submit booking request/);
  assert.doesNotMatch(book, /\["Review", "Confirm"\]/);
  assert.match(bookings, /acceptBookingTerms !== true/);
  assert.match(bookings, /payment_completion_deadline/);
  assert.match(bookings, /on conflict \(booking_id\) do nothing/);
  assert.doesNotMatch(bookings, /update booking_snapshots/);
  assert.match(terms, /PROPERTY_BOOKING_TERMS/);
  assert.match(terms, /version: "1"/);
  assert.doesNotMatch(terms, /version: "2"/);
  assert.match(merchant, /completeMerchantFundedBooking/);
  assert.match(router, /await confirmBooking\(client, result\.target_id, adminId\)/);
  assert.match(router, /await activateBooking\(client, result\.target_id\)/);
  assert.doesNotMatch(read("src/routes/app/bookings.$id.tsx"), /PaymentForm/);
  assert.doesNotMatch(read("src/routes/properties.$slug.tsx"), /PaymentForm/);
});

async function loadEngines() {
  const dir = mkdtempSync(join(tmpdir(), "darmelk-offer-polish-"));
  const outfile = join(dir, "engines.mjs");
  await esbuild.build({
    stdin: {
      contents: `
        export * as bookings from ${JSON.stringify(join(root, "backend/src/engine/bookings.ts"))};
        export * as offers from ${JSON.stringify(join(root, "backend/src/engine/offers.ts"))};
        export { formatCalendarDate } from ${JSON.stringify(join(root, "src/lib/offers.ts"))};
      `,
      resolveDir: join(root, "backend/src"),
      sourcefile: "polish-entry.ts",
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

test("PGlite: fixed deadline and installment amount freeze forward and leave old snapshots alone", async () => {
  const { bookings, offers, formatCalendarDate } = await loadEngines();
  assert.equal(formatCalendarDate("2028-12-31"), "31 December 2028");
  assert.equal(formatCalendarDate("2028-12-31T00:00:00.000Z"), "31 December 2028");
  const db = new PGlite();
  await applyMigrations(db);
  const seeded = await db.query(
    `select payment_completion_deadline::text as deadline, location from offers where slug = 'five-star-hotel-share'`,
  );
  assert.equal(seeded.rows[0].deadline, "2028-12-31");
  assert.equal(await db.query(`select count(*)::int as n from booking_snapshots`).then((r) => r.rows[0].n), 0);

  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('user_old', 'Old', 'old-polish@example.com', true, now(), now()),
      ('user_new', 'New', 'new-polish@example.com', true, now(), now());
    insert into members (user_id, referral_code, role, onboarding_complete, activation_status, activation_expires_at) values
      ('user_old', 'DM-OLDPL1', 'member', true, 'active', '2099-01-01'),
      ('user_new', 'DM-NEWPL1', 'member', true, 'active', '2099-01-01');
    insert into bookings (id, user_id, offer_slug, retail_value, booking_amount, qualification_benefit, commission_eligible_amount, status)
      values ('bk_old', 'user_old', 'five-star-hotel-share', 650000, 50000, 600000, 50000, 'activated');
    insert into booking_snapshots (
      id, booking_id, user_id, offer_slug, offer_title, retail_value, booking_amount, qualification_benefit,
      commission_eligible_amount, activated_at
    ) values (
      'snap_old', 'bk_old', 'user_old', 'five-star-hotel-share', 'Five-Star Hotel Share',
      650000, 50000, 600000, 50000, now()
    );
  `);

  const edited = await offers.updateOffer(db, "five-star-hotel-share", {
    location: "Cox's Bazar, Chattogram, Bangladesh",
    paymentCompletionDeadline: "2031-01-01",
    installmentEnabled: true,
    installmentCount: 24,
    installmentFrequency: "monthly",
    installmentAmount: 25000,
    installmentDurationMonths: 24,
  });
  assert.equal(edited.location, "Cox's Bazar, Chattogram, Bangladesh");
  assert.equal(asDate(edited.payment_completion_deadline), "2031-01-01");
  assert.equal(edited.installment_amount, 25000);
  assert.equal(edited.installment_duration_months, 24);

  const historical = await db.query(
    `select payment_completion_deadline::text as deadline, installment_amount, installment_duration_months
       from booking_snapshots where booking_id = 'bk_old'`,
  );
  assert.equal(historical.rows[0].deadline, null);
  assert.equal(historical.rows[0].installment_amount, null);
  assert.equal(historical.rows[0].installment_duration_months, null);

  await assert.rejects(() => bookings.createBooking(db, "user_new", "five-star-hotel-share", { acceptBookingTerms: false }));
  assert.equal((await db.query(`select count(*)::int as n from bookings where user_id = 'user_new'`)).rows[0].n, 0);

  const created = await bookings.createBooking(db, "user_new", "five-star-hotel-share", { acceptBookingTerms: true });
  assert.equal(asDate(created.payment_completion_deadline), "2031-01-01");
  assert.equal(created.installment_amount, 25000);
  assert.equal(created.installment_duration_months, 24);
  assert.equal(created.booking_amount, 50000);
  assert.equal(created.status, "pending");

  await bookings.confirmBooking(db, created.id, "user_new");
  await bookings.activateBooking(db, created.id);
  const frozen = await db.query(
    `select payment_completion_deadline::text as deadline, installment_amount, installment_duration_months, booking_amount
       from booking_snapshots where booking_id = $1`,
    [created.id],
  );
  assert.equal(frozen.rows[0].deadline, "2031-01-01");
  assert.equal(frozen.rows[0].installment_amount, 25000);
  assert.equal(frozen.rows[0].installment_duration_months, 24);
  assert.equal(frozen.rows[0].booking_amount, 50000);

  await offers.updateOffer(db, "five-star-hotel-share", {
    paymentCompletionDeadline: "2032-02-02",
    installmentAmount: 1000,
    location: "Dhaka",
  });
  const frozenAfter = await db.query(
    `select payment_completion_deadline::text as deadline, installment_amount from booking_snapshots where booking_id = $1`,
    [created.id],
  );
  const oldAfter = await db.query(
    `select payment_completion_deadline::text as deadline, installment_amount, booking_amount
       from booking_snapshots where booking_id = 'bk_old'`,
  );
  const bookingAfter = await db.query(
    `select payment_completion_deadline::text as deadline, installment_amount, booking_amount, status
       from bookings where id = $1`,
    [created.id],
  );
  assert.equal(frozenAfter.rows[0].deadline, "2031-01-01");
  assert.equal(frozenAfter.rows[0].installment_amount, 25000);
  assert.equal(oldAfter.rows[0].deadline, null);
  assert.equal(oldAfter.rows[0].installment_amount, null);
  assert.equal(oldAfter.rows[0].booking_amount, 50000);
  assert.equal(bookingAfter.rows[0].deadline, "2031-01-01");
  assert.equal(bookingAfter.rows[0].installment_amount, 25000);
  assert.equal(bookingAfter.rows[0].status, "activated");
});
