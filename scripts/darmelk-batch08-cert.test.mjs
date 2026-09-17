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

test("public and member shells expose a skip-to-content target", () => {
  const root = read("src/routes/__root.tsx");
  const app = read("src/components/layout/app-shell.tsx");
  const admin = read("src/components/layout/admin-shell.tsx");
  const states = read("src/components/states.tsx");
  assert.match(states, /export function SkipToContent/);
  assert.match(root, /SkipToContent/);
  assert.match(root, /id="main-content"/);
  assert.match(app, /SkipToContent/);
  assert.match(app, /id="main-content"/);
  assert.match(admin, /SkipToContent/);
  assert.match(admin, /id="main-content"/);
});

test("menu toggles and password visibility expose a visible focus ring", () => {
  const header = read("src/components/layout/site-header.tsx");
  const app = read("src/components/layout/app-shell.tsx");
  const admin = read("src/components/layout/admin-shell.tsx");
  const password = read("src/components/ui/password-field.tsx");
  assert.match(header, /size-11[\s\S]*focus-visible:ring-2 focus-visible:ring-pine[\s\S]*Open menu/);
  assert.match(app, /size-11[\s\S]*focus-visible:ring-2 focus-visible:ring-pine[\s\S]*Open menu/);
  assert.match(admin, /size-11[\s\S]*focus-visible:ring-2 focus-visible:ring-pine[\s\S]*Open menu/);
  assert.match(password, /focus-visible:ring-2 focus-visible:ring-pine[\s\S]*Hide password/);
});

test("JSON API responses send nosniff and deny framing", () => {
  const router = read("backend/src/router.ts");
  assert.match(router, /X-Content-Type-Options", "nosniff"/);
  assert.match(router, /X-Frame-Options", "DENY"/);
  assert.match(router, /Referrer-Policy", "strict-origin-when-cross-origin"/);
});

test("closed and coming-soon property CTAs explain why Request to Book is unavailable", () => {
  const property = read("src/routes/properties.\$slug.tsx");
  assert.match(property, /Coming soon/);
  assert.match(property, /no longer open for Request to Book/);
  assert.match(property, /not open for Request to Book yet/);
  assert.doesNotMatch(property, /Booking closed/);
  assert.doesNotMatch(property, />Sold out</);
});
