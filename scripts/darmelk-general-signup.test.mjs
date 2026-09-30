import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("general signup requires an active referral before Better Auth sign-up", () => {
  const src = read("src/routes/login.tsx");
  const auth = read("backend/src/auth.ts");
  const hook = read("backend/src/auth-referral-hook.ts");
  assert.match(src, /label="Referral ID"/);
  assert.doesNotMatch(src, /Referral ID \(Optional\)/);
  assert.doesNotMatch(src, /A referral ID is optional/);
  assert.doesNotMatch(src, /Add a referral ID only if you have one/);
  assert.doesNotMatch(src, /Have a referral ID\? Enter it here/);
  assert.match(src, /Referral ID is required\./);
  assert.match(src, /lookupSponsor\(trimmedReferral\)/);
  assert.match(src, /DARMELK_REFERRAL_HEADER/);
  assert.match(read("src/lib/referral.ts"), /x-darmelk-referral/);
  assert.match(src, /required/);
  assert.match(src, /aria-required="true"/);
  assert.match(src, /sponsorCode: trimmedReferral/);
  assert.doesNotMatch(src, /Growth Program/);
  assert.doesNotMatch(src, /3×5/);
  assert.doesNotMatch(src, /3x5/);
  assert.match(auth, /referralSignupHook/);
  assert.match(auth, /assertSignupReferral/);
  assert.match(hook, /\/sign-up\/email/);
  assert.match(hook, /DARMELK_REFERRAL_HEADER/);
  assert.match(read("backend/src/referral-messages.ts"), /x-darmelk-referral/);
  assert.doesNotMatch(auth, /additionalFields/);
});

test("backend onboarding requires an active referral and does not auto-provision a sponsorless member", () => {
  const src = read("backend/src/engine/members.ts");
  const ensure = src.slice(src.indexOf("export async function ensureMember"), src.indexOf("export async function assertSignupReferral"));
  const register = src.slice(src.indexOf("export async function registerMemberWithActiveReferral"), src.indexOf("export async function completeOnboarding"));
  assert.match(src, /export async function assertSignupReferral/);
  assert.match(src, /export async function registerMemberWithActiveReferral/);
  assert.match(src, /findOpenMatrixSlot/);
  assert.match(src, /referral_required/);
  assert.match(src, /sponsor_inactive/);
  assert.match(src, /if \(existing\?\.onboarding_complete\) return existing/);
  assert.doesNotMatch(ensure, /insert into members/);
  assert.match(ensure, /incomplete_registration/);
  assert.match(register, /findOpenMatrixSlot/);
  assert.match(register, /sponsor_user_id/);
  assert.doesNotMatch(register, /sponsor\?\.user_id \?\? null/);
  assert.doesNotMatch(src, /canSkipSponsor/);
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
