import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("offer management schema is additive and preserves booking snapshots", () => {
  const sql = read("migrations/0012_darmelk_offer_management.sql");
  assert.match(sql, /alter table "offers"/);
  assert.match(sql, /commission_eligible_amount/);
  assert.match(sql, /gallery/);
  assert.match(sql, /offer_media/);
  assert.match(sql, /'draft', 'published', 'closed'/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /update "bookings" set "booking_amount"/);
  const bookings = read("backend/src/engine/bookings.ts");
  assert.match(bookings, /commission_eligible_amount/);
  assert.match(bookings, /offer_version/);
  assert.match(bookings, /status !== "available" && offer.status !== "published"/);
  assert.match(bookings, /on conflict \(booking_id\) do nothing/);
});

test("admin offer routes cover list add edit preview", () => {
  assert.match(read("src/routes/admin/offers.index.tsx"), /Properties \/ Offers/);
  assert.match(read("src/routes/admin/offers.index.tsx"), /Add offer/);
  assert.match(read("src/routes/admin/offers.new.tsx"), /Save draft/);
  assert.match(read("src/routes/admin/offers.$slug.index.tsx"), /Save changes/);
  assert.match(read("src/routes/admin/offers.$slug.preview.tsx"), /Preview/);
  assert.match(read("src/components/layout/admin-shell.tsx"), /Properties/);
  assert.doesNotMatch(read("src/routes/admin/offers.$slug.index.tsx"), /window\.prompt/);
});

test("public catalog reads published offers and keeps flagship fallback", () => {
  const offers = read("src/lib/offers.ts");
  assert.match(offers, /five-star-hotel-share/);
  assert.match(offers, /650_000/);
  assert.match(offers, /category-resort\.jpg/);
  assert.match(offers, /export function fromApiOffer/);
  assert.match(offers, /export function pickFlagship/);
  const landing = read("src/components/landing/landing-page.tsx");
  assert.match(landing, /pickFlagship/);
  assert.match(landing, /api\.offers\(\)/);
  const list = read("src/routes/properties/index.tsx");
  assert.match(list, /catalogWithFallback/);
  const detail = read("src/routes/properties.$slug.tsx");
  assert.match(detail, /api\.offer/);
  assert.match(detail, /offerImages/);
  assert.doesNotMatch(detail, /Approved property imagery/);
  assert.doesNotMatch(detail, /BDT 600,000/);
});

test("admin offer APIs are role-protected", () => {
  const router = read("backend/src/router.ts");
  assert.match(router, /\/api\/admin\/offers/);
  assert.match(router, /requireAdmin/);
  assert.match(router, /createOffer/);
  assert.match(router, /updateOffer/);
  assert.match(router, /setOfferStatus/);
  assert.match(router, /addOfferMedia/);
  const engine = read("backend/src/engine/offers.ts");
  assert.match(engine, /Published offers need a main image/);
  assert.match(engine, /unsetOtherFlagships/);
});

test("previous locked production fixes remain intact", () => {
  const landing = read("src/components/landing/landing-page.tsx");
  const network = read("src/routes/app/network.tsx");
  const withdrawals = read("src/routes/admin/withdrawals.tsx");
  const badge = read("src/components/ui/status-badge.tsx");
  const engine = read("backend/src/engine/withdrawals.ts");
  assert.match(landing, /<span>Explore Property Opportunities<\/span>/);
  assert.match(landing, /<span>With Clarity and Confidence<\/span>/);
  assert.match(network, /Current Level Progress/);
  assert.match(withdrawals, /Mark as Paid/);
  assert.match(badge, /max-sm:min-h-8/);
  assert.match(engine, /lockWithdrawalFunds/);
});
