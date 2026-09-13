import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("general signup presents referral as optional and only looks it up when provided", () => {
  const src = read("src/routes/login.tsx");
  assert.match(src, /Referral ID \(Optional\)/);
  assert.match(src, /Have a referral ID\? Enter it here\./);
  assert.match(src, /A referral ID is optional/);
  assert.match(src, /const trimmedReferral = sponsorCode\.trim\(\)/);
  assert.match(src, /if \(trimmedReferral\) \{[\s\S]*lookupSponsor\(trimmedReferral\)/);
  assert.match(src, /sponsorCode: trimmedReferral/);
  assert.doesNotMatch(src, /Sponsor referral code is required/);
  const referralStart = src.indexOf('id="sponsor-code"');
  const referralField = src.slice(referralStart, src.indexOf("</Field>", referralStart));
  assert.doesNotMatch(referralField, /(?<![A-Za-z-])required(?![A-Za-z-])/);
  assert.doesNotMatch(src, /Growth Program/);
  assert.doesNotMatch(src, /3×5/);
  assert.doesNotMatch(src, /3x5/);
});

test("backend onboarding allows a null sponsor and skips matrix placement", () => {
  const src = read("backend/src/engine/members.ts");
  assert.match(src, /sponsorCode\?: string/);
  assert.match(src, /const code = \(data\.sponsorCode \?\? ""\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(src, /if \(sponsor\) \{[\s\S]*findOpenMatrixSlot/);
  assert.match(src, /sponsor\?\.user_id \?\? null/);
  assert.doesNotMatch(src, /sponsor_required/);
  assert.doesNotMatch(src, /canSkipSponsor/);
  assert.match(src, /if \(existing\.onboarding_complete\) return existing/);
});

test("sponsor schema stays nullable and additive", () => {
  const sql = read("migrations/0002_darmelk_core.sql");
  assert.match(sql, /"sponsor_user_id" text references "members" \("user_id"\)/);
  assert.doesNotMatch(sql, /sponsor_user_id" text not null/i);
});

test("guest marketplace and Request to Book contracts remain", () => {
  const details = read("src/routes/properties.$slug.tsx");
  const form = read("src/components/contact-form.tsx");
  assert.match(details, /Request to Book/);
  assert.match(details, /to="\/contact"/);
  assert.match(form, /source: "request_to_book"/);
  assert.match(form, /does not confirm a booking/);
});

test("growth engines are not rewritten in the general-signup batch", () => {
  const network = read("backend/src/engine/network.ts");
  const commissions = read("backend/src/engine/commissions.ts");
  const leadership = read("backend/src/engine/leadership.ts");
  const merchant = read("backend/src/engine/merchant.ts");
  const promotions = read("backend/src/engine/promotions.ts");
  const bookings = read("backend/src/engine/bookings.ts");
  const withdrawals = read("backend/src/engine/withdrawals.ts");
  const activation = read("backend/src/engine/activation.ts");
  assert.match(network, /PERSONAL_SPONSOR_TARGET = 3/);
  assert.match(commissions, /1: 0\.1/);
  assert.match(leadership, /TIER_100K|100000/);
  assert.match(merchant, /approveMerchantPaymentRequest|reserve/);
  assert.match(promotions, /evaluatePromotionsForConfirmedBooking/);
  assert.match(bookings, /activateBooking/);
  assert.match(withdrawals, /status/);
  assert.match(activation, /1000/);
});
