import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("shared mobile foundation clears bottom nav and prevents overflow", () => {
  const css = read("src/styles.css");
  assert.match(css, /--darmelk-bottom-nav-clearance/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /--darmelk-gutter/);
  assert.match(css, /\.app-main-with-nav/);
  assert.match(css, /\.app-bottom-nav/);
  assert.match(css, /padding-right:\s*2\.5rem;/);
  assert.match(css, /scroll-padding-top:\s*6rem;/);

  const app = read("src/components/layout/app-shell.tsx");
  const admin = read("src/components/layout/admin-shell.tsx");
  assert.match(app, /app-main-with-nav/);
  assert.match(app, /app-bottom-nav/);
  assert.match(admin, /app-main-with-nav/);
  assert.match(admin, /app-bottom-nav/);

  const rootDoc = read("src/routes/__root.tsx");
  assert.match(rootDoc, /viewport-fit=cover/);
});

test("referral copy remains on the right of the code row on mobile", () => {
  const src = read("src/routes/app/network.tsx");
  assert.match(src, /flex min-w-0 items-center justify-between gap-3 sm:block/);
  assert.match(src, /navigator\.clipboard\.writeText\(code\)/);
  assert.match(src, /Copied/);
});

test("property detail uses approved images and never shows a placeholder card", () => {
  const page = read("src/routes/properties.$slug.tsx");
  const offers = read("src/lib/offers.ts");
  assert.match(page, /offerImages/);
  assert.doesNotMatch(page, /Approved property imagery/);
  assert.match(offers, /gallery/);
  assert.match(offers, /category-resort\.jpg/);
  assert.match(offers, /export function offerImages/);
  assert.match(page, /rest\.length === 1/);
  assert.match(page, /rest\.length > 1/);
});

test("hero is the locked two-line Opportunities composition", () => {
  const src = read("src/components/landing/landing-page.tsx");
  const css = read("src/styles.css");
  assert.match(src, /<span>Explore Property Opportunities<\/span>/);
  assert.match(src, /<span>With Clarity and Confidence<\/span>/);
  assert.doesNotMatch(src, /Oportunities/);
  assert.doesNotMatch(src, /with Clarity and Confidence\./);
  assert.match(css, /\.hero-headline/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(src, /hero-gateway\.jpg/);
  assert.match(src, /hero-gateway-mobile\.webp/);
  assert.match(src, /<picture>/);
  assert.match(src, /Explore Properties/);
  assert.match(src, /How Darmelk Works/);
});

test("previous locked production fixes remain intact", () => {
  const landing = read("src/components/landing/landing-page.tsx");
  const network = read("src/routes/app/network.tsx");
  const withdrawals = read("src/routes/admin/withdrawals.tsx");
  const badge = read("src/components/ui/status-badge.tsx");
  const engine = read("backend/src/engine/withdrawals.ts");
  assert.match(landing, /Hotel & Resort Shares/);
  assert.match(landing, /Clear Property Terms\. Documented Activity\./);
  assert.match(network, /Current Level Progress/);
  assert.doesNotMatch(network, /label="Confirmed Members"/);
  assert.match(withdrawals, /Transaction \/ Reference ID/);
  assert.match(withdrawals, /Mark as Paid/);
  assert.doesNotMatch(withdrawals, /window\.prompt/);
  assert.match(badge, /max-sm:min-h-8/);
  assert.match(engine, /lockWithdrawalFunds/);
});
