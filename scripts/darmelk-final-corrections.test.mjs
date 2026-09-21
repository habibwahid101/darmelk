import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("landing order is Hero → Flagship → Explore Properties → How Darmelk Works", () => {
  const src = read("src/components/landing/landing-page.tsx");
  const hero = src.indexOf("Explore Property Opportunities");
  const flagship = src.indexOf("Flagship property");
  const explore = src.indexOf(">Explore Properties<");
  const how = src.indexOf("How Darmelk works");
  assert.ok(hero >= 0 && flagship > hero && explore > flagship && how > explore);
  assert.match(src, /Explore Properties[\s\S]*How Darmelk Works/);
  assert.match(src, /Hotel & Resort Shares/);
  assert.match(src, /Land & Plots/);
  assert.match(src, /Flats & Apartments/);
  assert.match(src, /Commercial Properties/);
  assert.match(src, /Clear Property Terms\. Documented Activity\./);
  assert.match(src, /hero-gateway\.jpg/);
  assert.doesNotMatch(src, /alt="Five-Star Hotel Share"/);
});

test("registration treats referral as optional and keeps clickable terms", () => {
  const src = read("src/routes/login.tsx");
  assert.match(src, /Referral ID \(Optional\)/);
  assert.match(src, /Have a referral ID\? Enter it here\./);
  assert.doesNotMatch(src, /Sponsor referral code is required/);
  assert.match(src, /I have read, understood, and agree to the/);
  assert.match(src, /to="\/terms"/);
  assert.match(src, /Terms & Conditions/);
  assert.match(src, /lookupSponsor/);
  assert.match(src, /termsAccepted: true/);
  assert.match(src, /navigate\(\{ to: "\/app"/);
});

test("post-signup onboarding page is a dashboard redirect", () => {
  const src = read("src/routes/app/onboarding.tsx");
  assert.match(src, /Navigate to="\/app"/);
  assert.doesNotMatch(src, /Set up your member record/);
});

test("footer drops Account group and includes Contact Us", () => {
  const src = read("src/components/layout/site-footer.tsx");
  assert.match(src, /Contact Us/);
  assert.match(src, /to="\/contact"/);
  assert.doesNotMatch(src, /Create account/);
  assert.doesNotMatch(src, /Member area/);
  assert.doesNotMatch(src, /Forgot password/);
});

test("native select chevron has right-side padding", () => {
  const src = read("src/styles.css");
  assert.match(src, /select\s*\{[\s\S]*padding-right:\s*2\.5rem;/);
  assert.match(src, /scroll-padding-top:\s*6rem;/);
});

test("overview no longer shows Details after activation", () => {
  const src = read("src/routes/app/index.tsx");
  assert.doesNotMatch(src, />Details</);
});

test("referral card exposes Copy code, Copy link, and Share", () => {
  const src = read("src/components/referral-share.tsx");
  assert.match(src, /Your Referral/);
  assert.match(src, /Copy code/);
  assert.match(src, /Copy link/);
  assert.match(src, /navigator\.clipboard\.writeText/);
  assert.match(src, /Copied/);
  assert.match(read("src/routes/app/network.tsx"), /ReferralShareCard/);
});
