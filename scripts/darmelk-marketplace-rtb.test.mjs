import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("public property details use Request to Book and do not force signup", () => {
  const src = read("src/routes/properties.$slug.tsx");
  assert.match(src, /Request to Book/);
  assert.match(src, /to="\/contact"/);
  assert.match(src, /intent:\s*"book"/);
  assert.match(src, /to="\/app\/book\/\$slug"/);
  assert.doesNotMatch(src, /Create Account to Continue/);
  assert.doesNotMatch(src, /Checking account/);
  assert.doesNotMatch(src, /Activate Your ID/);
  assert.doesNotMatch(src, /Qualification benefit/);
});

test("guest Request to Book reuses Contact form with property context", () => {
  const page = read("src/routes/contact.tsx");
  const form = read("src/components/contact-form.tsx");
  assert.match(page, /intent === "book"/);
  assert.match(page, /ContactForm/);
  assert.match(form, /source: "request_to_book"/);
  assert.match(form, /does not confirm a booking/);
  assert.match(form, /Selected property/);
  assert.doesNotMatch(form, /reserved/);
});

test("contact property context migration is additive", () => {
  const sql = read("migrations/0017_darmelk_contact_property_context.sql");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.match(sql, /offer_slug/);
  assert.match(sql, /offer_title/);
  assert.match(sql, /request_to_book/);
  assert.match(sql, /add column if not exists/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(statements, /\bbookings\b/);
  assert.doesNotMatch(statements, /\bcommissions\b/);
  assert.doesNotMatch(statements, /\bmembers\b/);
});

test("landing marketplace copy leads with enquiry, not Growth mechanics", () => {
  const src = read("src/components/landing/landing-page.tsx");
  assert.match(src, /Request to Book/);
  assert.match(src, /No account is required to enquire/);
  assert.match(src, /does not reserve the property/);
  assert.doesNotMatch(src, /AmountRow label="Qualification benefit"/);
  assert.doesNotMatch(src, /Personally sponsor 3/);
  assert.match(src, /<span>Explore Property Opportunities<\/span>/);
  assert.match(src, /<span>With Clarity and Confidence<\/span>/);
});

test("public header includes Contact without removing existing public destinations", () => {
  const src = read("src/components/layout/site-header.tsx");
  assert.match(src, /label: "Properties"/);
  assert.match(src, /label: "Contact"/);
  assert.match(src, /to: "\/contact"/);
  assert.match(src, /label: "FAQ"/);
});
