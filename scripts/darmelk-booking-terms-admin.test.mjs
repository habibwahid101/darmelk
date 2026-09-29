import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  const dir = mkdtempSync(join(tmpdir(), "darmelk-booking-terms-"));
  const outfile = join(dir, "engines.mjs");
  await esbuild.build({
    stdin: {
      contents: `
        export * as terms from ${JSON.stringify(join(root, "backend/src/engine/terms.ts"))};
        export * as bookings from ${JSON.stringify(join(root, "backend/src/engine/bookings.ts"))};
      `,
      resolveDir: join(root, "backend/src"),
      sourcefile: "booking-terms-entry.ts",
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
  const { readdirSync } = await import("node:fs");
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

test("booking confirmation copy is short and still confirms through the existing booking path", () => {
  const book = read("src/routes/app/book.$slug.tsx");
  const accept = read("src/components/terms-accept.tsx");
  const bookings = read("backend/src/engine/bookings.ts");
  assert.match(book, /Before you confirm/);
  assert.match(
    book,
    /Your booking will be created using the commercial terms shown above\. These terms will remain attached to this booking even if the live offer is updated later\./,
  );
  assert.match(book, /After confirming, you will proceed to payment using the available payment methods\./);
  assert.doesNotMatch(book, /What happens next/);
  assert.doesNotMatch(book, /Inventory is consumed/);
  assert.doesNotMatch(book, /Reversal does not restore/);
  assert.doesNotMatch(book, /Qualification benefit stays attached/);
  assert.doesNotMatch(book, /Growth Program Activation is a separate/);
  assert.doesNotMatch(book, /The box starts unchecked/);
  assert.doesNotMatch(book, /Bank payment submission does not confirm/);
  assert.match(book, /hideLegend/);
  assert.match(book, /Property Booking Terms for this booking/);
  assert.match(book, /\/terms\?key=booking/);
  assert.match(book, /api\.myConsents\(\)/);
  assert.match(book, /document_version === currentTerms\.version/);
  assert.match(book, /alreadyAccepted/);
  assert.doesNotMatch(book, /PROPERTY_BOOKING_TERMS:\s*true/);
  assert.match(accept, /I have read and agree to the/);
  assert.match(book, /Confirm Booking/);
  assert.match(book, /disabled=\{pending \|\| !termsReady\}/);
  assert.match(book, /api\.createBooking\(offer\.slug, crypto\.randomUUID\(\), true\)/);
  assert.ok(book.indexOf("api.createBooking") < book.indexOf('setStep("payment")'));
  assert.match(book, /PaymentForm targetType="booking"/);
  assert.match(book, /does not wait for Darmelk/);
  assert.match(bookings, /acceptBookingTerms !== true/);
  assert.match(bookings, /context: "booking"/);
  assert.match(bookings, /referenceId: booking\.id/);
});

test("admin booking terms reuse the current engine and do not publish version 2", () => {
  const terms = read("backend/src/engine/terms.ts");
  const router = read("backend/src/router.ts");
  const admin = read("src/routes/admin/terms.tsx");
  const policy = read("src/components/policy-document.tsx");
  const migration = read("migrations/0022_darmelk_booking_terms_admin.sql");
  const statements = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const booking = terms.slice(terms.indexOf("PROPERTY_BOOKING_TERMS:"), terms.indexOf("DARMELK_PAYMENT_TERMS:"));
  assert.match(booking, /version: "1"/);
  assert.match(booking, /A binding Growth property booking freezes the selected offer/);
  assert.match(booking, /Payment submission and Merchant approval do not confirm the booking/);
  assert.doesNotMatch(terms, /version: "2"/);
  assert.doesNotMatch(terms, /update user_consents/i);
  assert.doesNotMatch(terms, /delete from user_consents/i);
  assert.match(terms, /resolveCurrentPolicy/);
  assert.match(terms, /status = 'published'/);
  assert.match(terms, /terms_published_locked/);
  assert.match(router, /listResolvedPolicies/);
  assert.match(router, /resolvePolicyRequest/);
  assert.match(router, /createBookingTermsDraft/);
  assert.match(router, /updateBookingTermsDraft/);
  assert.match(router, /publishBookingTermsDraft/);
  assert.match(router, /\/api\/admin\/terms\/booking/);
  assert.doesNotMatch(router, /app\.delete\("\/api\/admin\/terms/);
  assert.match(admin, /Booking Terms/);
  assert.match(admin, /\/terms\?key=booking/);
  assert.match(admin, /Publish/);
  assert.match(admin, /Published versions are read-only/);
  assert.doesNotMatch(admin, /version:\s*"2"/);
  assert.doesNotMatch(admin, />Delete</);
  assert.match(policy, /Version: \{document\.version\}/);
  assert.match(policy, /Effective: \{document\.effectiveDate\}/);
  assert.match(policy, /\(#\{1,3\}\)/);
  assert.match(migration, /policy_revisions/);
  assert.match(migration, /PROPERTY_BOOKING_TERMS/);
  assert.doesNotMatch(statements, /insert into/i);
  assert.doesNotMatch(statements, /drop table/i);
  assert.doesNotMatch(statements, /truncate/i);
  assert.doesNotMatch(statements, /delete from/i);
  assert.doesNotMatch(statements, /update "/i);
});

test("PGlite: drafts stay private, publish preserves history, and a new version requires new consent", async () => {
  const { terms, bookings } = await loadEngines();
  const db = new PGlite();
  await applyMigrations(db);
  const code = terms.POLICY_DOCUMENTS.PROPERTY_BOOKING_TERMS;
  assert.equal(code.version, "1");
  assert.equal(code.slug, "booking");
  assert.equal(code.paragraphs.length, 6);
  assert.match(code.paragraphs[0], /^A binding Growth property booking freezes the selected offer/);
  assert.match(code.paragraphs[3], /Payment submission and Merchant approval do not confirm the booking/);

  assert.equal(await count(db, `select count(*)::int as n from policy_revisions`), 0);
  const initial = await terms.resolvePolicyRequest(db, "booking");
  assert.equal(initial.version, "1");
  assert.equal(initial.paragraphs[0], code.paragraphs[0]);
  const listed = await terms.listResolvedPolicies(db);
  assert.equal(listed.find((doc) => doc.key === "PROPERTY_BOOKING_TERMS").version, "1");
  assert.equal(listed.find((doc) => doc.key === "GROWTH_PROGRAM_TERMS").version, "1");

  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('user_terms', 'Terms', 'booking-terms@example.com', true, now(), now());
    insert into members (user_id, referral_code, role, onboarding_complete, activation_status, activation_expires_at) values
      ('user_terms', 'DM-TERMS1', 'member', true, 'active', '2099-01-01');
  `);
  await terms.recordConsents(db, "user_terms", {
    keys: ["PROPERTY_BOOKING_TERMS"],
    context: "booking",
    referenceId: "bk_prior",
  });
  assert.equal(await terms.hasCurrentConsent(db, "user_terms", "PROPERTY_BOOKING_TERMS"), true);
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_terms' and document_version = '1'`),
    1,
  );

  const draft = await terms.createBookingTermsDraft(db, "user_terms", {
    version: "qa-draft",
    title: "Property Booking Terms",
    effectiveDate: "2026-09-15",
    summary: "Private draft",
    body: "Private draft paragraph that must not be public.\n\n# Private heading\n\nSecond private paragraph.",
  });
  assert.equal(draft.status, "draft");
  const edited = await terms.updateBookingTermsDraft(db, draft.id, {
    body: "Updated private draft paragraph.\n\nStill not public.",
  });
  assert.equal(edited.status, "draft");
  assert.match(edited.body, /Updated private draft paragraph/);
  const whileDraft = await terms.resolvePolicyRequest(db, "booking");
  assert.equal(whileDraft.version, "1");
  assert.equal(whileDraft.paragraphs[0], code.paragraphs[0]);
  assert.doesNotMatch(whileDraft.paragraphs.join("\n"), /Updated private|Private draft/);
  const adminWhileDraft = await terms.getBookingTermsAdmin(db);
  assert.equal(adminWhileDraft.current.source, "code");
  assert.equal(adminWhileDraft.current.version, "1");
  assert.equal(adminWhileDraft.revisions.find((row) => row.id === draft.id).current, false);
  assert.equal(await terms.hasCurrentConsent(db, "user_terms", "PROPERTY_BOOKING_TERMS"), true);

  const published = await terms.publishBookingTermsDraft(db, draft.id, "user_terms");
  assert.equal(published.status, "published");
  assert.equal(published.version, "qa-draft");
  const current = await terms.resolveCurrentPolicy(db, "PROPERTY_BOOKING_TERMS");
  assert.equal(current.version, "qa-draft");
  assert.match(current.paragraphs.join("\n"), /Updated private draft paragraph/);
  assert.equal(await terms.hasCurrentConsent(db, "user_terms", "PROPERTY_BOOKING_TERMS"), false);
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_terms' and document_version = '1'`),
    1,
  );

  await assert.rejects(
    () => terms.updateBookingTermsDraft(db, draft.id, { body: "overwrite published text" }),
    (err) => err.code === "terms_published_locked",
  );
  const preservedBody = (await db.query(`select body, status, version from policy_revisions where id = $1`, [draft.id])).rows[0];
  assert.equal(preservedBody.status, "published");
  assert.equal(preservedBody.version, "qa-draft");
  assert.match(preservedBody.body, /Updated private draft paragraph/);

  const next = await terms.createBookingTermsDraft(db, "user_terms", {
    version: "qa-next",
    title: "Property Booking Terms",
    effectiveDate: "2026-10-01",
    body: "Newer published booking terms paragraph.",
  });
  const stillPrevious = await terms.resolvePolicyRequest(db, "booking");
  assert.equal(stillPrevious.version, "qa-draft");
  assert.doesNotMatch(stillPrevious.paragraphs.join("\n"), /Newer published/);
  await terms.publishBookingTermsDraft(db, next.id, "user_terms");
  const newest = await terms.resolvePolicyRequest(db, "booking");
  assert.equal(newest.version, "qa-next");
  assert.match(newest.paragraphs[0], /Newer published booking terms paragraph/);
  const history = await terms.getBookingTermsAdmin(db);
  assert.equal(history.current.source, "database");
  assert.equal(history.current.version, "qa-next");
  const older = history.revisions.find((row) => row.id === draft.id);
  const latest = history.revisions.find((row) => row.id === next.id);
  assert.equal(older.status, "published");
  assert.equal(older.current, false);
  assert.match(older.body, /Updated private draft paragraph/);
  assert.equal(latest.status, "published");
  assert.equal(latest.current, true);
  await assert.rejects(
    () => terms.publishBookingTermsDraft(db, draft.id, "user_terms"),
    (err) => err.code === "terms_published_locked",
  );

  await assert.rejects(
    () => bookings.createBooking(db, "user_terms", "five-star-hotel-share", { acceptBookingTerms: false }),
    (err) => err.code === "terms_required",
  );
  assert.equal(await count(db, `select count(*)::int as n from bookings where user_id = 'user_terms'`), 0);
  const created = await bookings.createBooking(db, "user_terms", "five-star-hotel-share", { acceptBookingTerms: true });
  assert.equal(created.status, "pending");
  assert.equal(
    await count(
      db,
      `select count(*)::int as n from user_consents
        where user_id = 'user_terms' and document_key = 'PROPERTY_BOOKING_TERMS' and document_version = 'qa-next' and context = 'booking' and reference_id = $1`,
      [created.id],
    ),
    1,
  );
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_terms' and document_version = '1' and reference_id = 'bk_prior'`),
    1,
  );
  assert.equal(await terms.hasCurrentConsent(db, "user_terms", "PROPERTY_BOOKING_TERMS"), true);
  const second = await bookings.createBooking(db, "user_terms", "five-star-hotel-share", { acceptBookingTerms: true });
  assert.notEqual(second.id, created.id);
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_terms' and document_version = 'qa-next'`),
    2,
  );
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_terms' and document_version = '1'`),
    1,
  );
  await assert.rejects(
    () => bookings.createBooking(db, "user_terms", "five-star-hotel-share", {}),
    (err) => err.code === "terms_required",
  );
  assert.equal(await count(db, `select count(*)::int as n from bookings where user_id = 'user_terms'`), 2);
  assert.equal(code.version, "1");
  assert.match(code.paragraphs[3], /Payment submission and Merchant approval do not confirm the booking/);
});

test("current booking terms version cannot be reused by a draft", () => {
  const terms = read("backend/src/engine/terms.ts");
  const book = read("src/routes/app/book.$slug.tsx");
  const migration = read("migrations/0022_darmelk_booking_terms_admin.sql");
  const booking = terms.slice(terms.indexOf("PROPERTY_BOOKING_TERMS:"), terms.indexOf("DARMELK_PAYMENT_TERMS:"));
  const guard = terms.slice(
    terms.indexOf("async function assertNotCurrentPublishedVersion"),
    terms.indexOf("async function assertVersionAvailable"),
  );
  const publish = terms.slice(terms.indexOf("export async function publishBookingTermsDraft"));
  assert.match(booking, /version: "1"/);
  assert.doesNotMatch(terms, /version: "2"/);
  assert.match(guard, /resolveCurrentPolicy/);
  assert.match(guard, /A new Terms revision must use a new version\./);
  assert.match(terms, /if \(!row\) return code/);
  assert.match(publish, /for update/);
  assert.match(publish, /assertNotCurrentPublishedVersion\(client, draft\.version, \{ lock: true \}\)/);
  assert.ok(publish.indexOf("assertNotCurrentPublishedVersion") < publish.indexOf("status = 'published'"));
  assert.match(terms.slice(terms.indexOf("export async function createBookingTermsDraft"), terms.indexOf("export async function updateBookingTermsDraft")), /assertNotCurrentPublishedVersion/);
  assert.match(terms.slice(terms.indexOf("export async function updateBookingTermsDraft"), terms.indexOf("export async function publishBookingTermsDraft")), /assertNotCurrentPublishedVersion/);
  assert.doesNotMatch(migration, /insert into/i);
  assert.match(book, /document_version === currentTerms\.version/);
  assert.match(book, /alreadyAccepted/);
  assert.doesNotMatch(terms, /delete from user_consents/i);
  assert.doesNotMatch(terms, /update user_consents/i);
});

test("PGlite: code-backed current version is blocked on create, update, and publish", async () => {
  const { terms } = await loadEngines();
  const db = new PGlite();
  await applyMigrations(db);
  const code = terms.POLICY_DOCUMENTS.PROPERTY_BOOKING_TERMS;
  const reused = (err) => err.code === "terms_version_reused" && err.message === "A new Terms revision must use a new version.";

  const admin = await terms.getBookingTermsAdmin(db);
  assert.equal(admin.current.source, "code");
  assert.equal(admin.current.version, "1");
  assert.equal(admin.current.version, code.version);
  assert.equal(admin.current.body, code.paragraphs.join("\n\n"));
  assert.equal(await count(db, `select count(*)::int as n from policy_revisions`), 0);

  await db.exec(`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('user_guard', 'Guard', 'booking-terms-guard@example.com', true, now(), now());
    insert into members (user_id, referral_code, role, onboarding_complete, activation_status, activation_expires_at) values
      ('user_guard', 'DM-GUARD1', 'admin', true, 'active', '2099-01-01');
  `);

  await assert.rejects(
    () =>
      terms.createBookingTermsDraft(db, "user_guard", {
        version: code.version,
        title: "Property Booking Terms",
        effectiveDate: "2026-09-15",
        body: "Different legal text that must not reuse version 1.",
      }),
    reused,
  );
  assert.equal(await count(db, `select count(*)::int as n from policy_revisions`), 0);

  const draft = await terms.createBookingTermsDraft(db, "user_guard", {
    version: "qa-new",
    title: "Property Booking Terms",
    effectiveDate: "2026-10-01",
    summary: "Unpublished draft",
    body: "A future booking terms draft that is not current.",
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.version, "qa-new");
  const whileDraft = await terms.resolveCurrentPolicy(db, "PROPERTY_BOOKING_TERMS");
  assert.equal(whileDraft.version, "1");
  assert.equal(whileDraft.paragraphs[0], code.paragraphs[0]);

  await assert.rejects(
    () => terms.updateBookingTermsDraft(db, draft.id, { version: code.version, body: "Edited onto the current version." }),
    reused,
  );
  const kept = (await db.query(`select version, status, body from policy_revisions where id = $1`, [draft.id])).rows[0];
  assert.equal(kept.version, "qa-new");
  assert.equal(kept.status, "draft");
  assert.match(kept.body, /A future booking terms draft/);

  await terms.recordConsents(db, "user_guard", {
    keys: ["PROPERTY_BOOKING_TERMS"],
    context: "booking",
    referenceId: "bk_guard_prior",
  });
  assert.equal(await terms.hasCurrentConsent(db, "user_guard", "PROPERTY_BOOKING_TERMS"), true);
  await terms.recordConsents(db, "user_guard", {
    keys: ["PROPERTY_BOOKING_TERMS"],
    context: "booking",
    referenceId: "bk_guard_prior",
  });
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_guard' and document_version = '1'`),
    1,
  );
  assert.equal(await terms.hasCurrentConsent(db, "user_guard", "PROPERTY_BOOKING_TERMS"), true);

  await db.query(
    `insert into policy_revisions
       (id, document_key, version, title, effective_date, summary, body, status, created_by_admin_id)
     values ('term_code_reuse', 'PROPERTY_BOOKING_TERMS', '1', 'Property Booking Terms', '2026-09-15', '', $1, 'draft', 'user_guard')`,
    ["Changed legal text that must not publish as version 1."],
  );
  await assert.rejects(() => terms.publishBookingTermsDraft(db, "term_code_reuse", "user_guard"), reused);
  const blocked = (await db.query(`select status, body from policy_revisions where id = 'term_code_reuse'`)).rows[0];
  assert.equal(blocked.status, "draft");
  assert.match(blocked.body, /Changed legal text/);
  const stillCode = await terms.resolvePolicyRequest(db, "booking");
  assert.equal(stillCode.version, "1");
  assert.equal(stillCode.paragraphs[0], code.paragraphs[0]);
  assert.doesNotMatch(stillCode.paragraphs.join("\n"), /Changed legal text/);

  const early = await terms.createBookingTermsDraft(db, "user_guard", {
    version: "qa-early",
    title: "Property Booking Terms",
    effectiveDate: "2026-10-02",
    body: "Early draft that must not publish after its version becomes current.",
  });
  const live = await terms.createBookingTermsDraft(db, "user_guard", {
    version: "qa-live",
    title: "Property Booking Terms",
    effectiveDate: "2026-10-03",
    body: "Later revision that becomes current first.",
  });
  await terms.publishBookingTermsDraft(db, live.id, "user_guard");
  assert.equal((await terms.resolveCurrentPolicy(db, "PROPERTY_BOOKING_TERMS")).version, "qa-live");
  await assert.rejects(() => terms.updateBookingTermsDraft(db, early.id, { version: "qa-live" }), reused);

  await db.exec(`alter table policy_revisions drop constraint policy_revisions_key_version_unique`);
  await db.query(`update policy_revisions set version = 'qa-live' where id = $1`, [early.id]);
  await assert.rejects(() => terms.publishBookingTermsDraft(db, early.id, "user_guard"), reused);
  const earlyRow = (await db.query(`select status, version from policy_revisions where id = $1`, [early.id])).rows[0];
  assert.equal(earlyRow.status, "draft");
  assert.equal(earlyRow.version, "qa-live");
  const current = await terms.resolveCurrentPolicy(db, "PROPERTY_BOOKING_TERMS");
  assert.equal(current.version, "qa-live");
  assert.match(current.paragraphs[0], /Later revision that becomes current first/);
  assert.doesNotMatch(current.paragraphs.join("\n"), /Early draft/);
  assert.equal(await terms.hasCurrentConsent(db, "user_guard", "PROPERTY_BOOKING_TERMS"), false);
  assert.equal(
    await count(
      db,
      `select count(*)::int as n from user_consents where user_id = 'user_guard' and document_version = '1' and reference_id = 'bk_guard_prior'`,
    ),
    1,
  );
  await terms.recordConsents(db, "user_guard", {
    keys: ["PROPERTY_BOOKING_TERMS"],
    context: "booking",
    referenceId: "bk_guard_next",
  });
  assert.equal(await terms.hasCurrentConsent(db, "user_guard", "PROPERTY_BOOKING_TERMS"), true);
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_guard' and document_version = 'qa-live'`),
    1,
  );
  assert.equal(
    await count(db, `select count(*)::int as n from user_consents where user_id = 'user_guard' and document_version = '1'`),
    1,
  );
  assert.equal(await count(db, `select count(*)::int as n from policy_revisions where version = '2' and status = 'published'`), 0);
  assert.equal(code.version, "1");
  assert.match(code.paragraphs[0], /^A binding Growth property booking freezes the selected offer/);
  assert.match(code.paragraphs[3], /Payment submission and Merchant approval do not confirm the booking/);
});
