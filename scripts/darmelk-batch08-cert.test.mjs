import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("contact submissions are rate-limited on mobile, globally, and by IP", () => {
  const engine = read("backend/src/engine/contact.ts");
  const router = read("backend/src/router.ts");
  const errors = read("backend/src/errors.ts");
  assert.match(errors, /tooManyRequests/);
  assert.match(errors, /429/);
  assert.match(engine, /tooManyRequests/);
  assert.match(engine, /CONTACT_PER_MOBILE/);
  assert.match(engine, /CONTACT_GLOBAL_CAP/);
  assert.match(router, /allowContactIp/);
  assert.match(router, /x-forwarded-for/);
  assert.match(router, /err\.status as 400 \| 401 \| 403 \| 404 \| 409 \| 429/);
});

test("password reset uses the Darmelk API client and Darmelk-only copy", () => {
  const src = read("src/routes/forgot-password.tsx");
  assert.match(src, /authClient\.requestPasswordReset/);
  assert.match(src, /window\.location\.origin\}\/reset-password/);
  assert.doesNotMatch(src, /\/api\/auth\/request-password-reset/);
  assert.doesNotMatch(src, /Google or X/);
  assert.doesNotMatch(src, /Sign in with Google/);
});

test("binary media responses send nosniff", () => {
  const router = read("backend/src/router.ts");
  assert.match(router, /x-content-type-options": "nosniff"/);
  assert.match(router, /function binaryHeaders/);
});

test("signed-in chrome hides Create Account and keeps Request to Book enquiry-only", () => {
  const header = read("src/components/layout/site-header.tsx");
  const property = read("src/routes/properties.\$slug.tsx");
  assert.match(header, /<SignedOut>[\s\S]*Create Account/);
  assert.match(property, /Request to Book/);
  assert.match(property, /Coming soon/);
  assert.doesNotMatch(property, /Booking closed/);
  assert.doesNotMatch(property, />Sold out</);
});

test("privacy documents are not branded as Terms", () => {
  const src = read("src/components/policy-document.tsx");
  assert.match(src, /PRIVACY_POLICY" \? "Privacy" : "Terms"/);
  assert.match(src, /That document is not published/);
  assert.doesNotMatch(src, /That terms document is not published/);
});
