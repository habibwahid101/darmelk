import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("frontend Vercel responses send conservative security headers without DENY framing", () => {
  const vercel = read("vercel.json");
  assert.match(vercel, /X-Content-Type-Options/);
  assert.match(vercel, /nosniff/);
  assert.match(vercel, /Referrer-Policy/);
  assert.match(vercel, /strict-origin-when-cross-origin/);
  assert.match(vercel, /Permissions-Policy/);
  assert.match(vercel, /camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.doesNotMatch(vercel, /X-Frame-Options/);
  assert.doesNotMatch(vercel, /Content-Security-Policy/);
});

test("JSON API still sends nosniff and deny framing", () => {
  const router = read("backend/src/router.ts");
  assert.match(router, /X-Content-Type-Options", "nosniff"/);
  assert.match(router, /X-Frame-Options", "DENY"/);
  assert.match(router, /Referrer-Policy", "strict-origin-when-cross-origin"/);
});
