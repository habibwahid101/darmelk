import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("homepage hero uses the consultation visual with desktop and mobile crops", () => {
  const src = read("src/components/landing/landing-page.tsx");
  assert.match(src, /<picture>/);
  assert.match(src, /hero-gateway-mobile\.webp/);
  assert.match(src, /hero-gateway-mobile\.jpg/);
  assert.match(src, /hero-gateway\.webp/);
  assert.match(src, /hero-gateway\.jpg/);
  assert.match(src, /object-\[center_28%\]/);
  assert.match(src, /sm:object-\[center_46%\]/);
  assert.match(src, /<p className="text-xs font-medium uppercase tracking-\[\.2em\] text-cream\/70">Your property gateway<\/p>/);
  assert.match(src, /<span>Explore Property Opportunities<\/span>/);
  assert.match(src, /<span>With Clarity and Confidence<\/span>/);
  assert.match(
    src,
    /Discover carefully presented property opportunities with clear terms, documented activity, and a straightforward path from exploration to booking\./,
  );
  assert.match(src, /Explore Properties/);
  assert.match(src, /How Darmelk Works/);
  assert.doesNotMatch(src, /hero-platform\.jpg/);

  const login = read("src/routes/login.tsx");
  assert.match(login, /hero-platform\.jpg/);
});

test("hero gateway assets exist and stay within a web budget", () => {
  const desktop = statSync(join(root, "public/images/hero-gateway.jpg"));
  const desktopWebp = statSync(join(root, "public/images/hero-gateway.webp"));
  const mobile = statSync(join(root, "public/images/hero-gateway-mobile.jpg"));
  const mobileWebp = statSync(join(root, "public/images/hero-gateway-mobile.webp"));
  assert.ok(desktop.size > 40_000 && desktop.size < 400_000, desktop.size);
  assert.ok(desktopWebp.size > 20_000 && desktopWebp.size < 250_000, desktopWebp.size);
  assert.ok(mobile.size > 30_000 && mobile.size < 300_000, mobile.size);
  assert.ok(mobileWebp.size > 15_000 && mobileWebp.size < 200_000, mobileWebp.size);
});
