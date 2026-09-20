import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("prelaunch reset preview is admin-protected and read-only", () => {
  const handler = read("backend/src/handler.ts");
  const http = read("backend/src/engine/prelaunch-reset-http.ts");
  const engine = read("backend/src/engine/prelaunch-reset.ts");
  assert.match(handler, /registerPrelaunchResetPreview/);
  assert.match(http, /app\.get\("\/api\/admin\/maintenance\/prelaunch-reset\/preview"/);
  assert.match(http, /requireAdmin\(client, adminId\)/);
  assert.match(http, /previewPrelaunchReset/);
  assert.doesNotMatch(http, /app\.post\(/);
  assert.doesNotMatch(http, /app\.delete\(/);
  assert.doesNotMatch(engine, /\bDELETE\b/);
  assert.doesNotMatch(engine, /\bUPDATE\b/);
  assert.doesNotMatch(engine, /\bTRUNCATE\b/);
  assert.doesNotMatch(engine, /\bINSERT\b/);
  assert.match(engine, /execution_authorized: false/);
  assert.match(engine, /destructive_endpoint: false/);
  assert.match(engine, /ONE-TIME PRELAUNCH CLEAN RESET/);
  assert.match(engine, /export function maskEmail/);
  assert.match(engine, /soldForOffer/);
  assert.match(engine, /five-star-hotel-share/);
  assert.match(engine, /booking_snapshots/);
  assert.match(engine, /reversal_entries/);
  assert.match(engine, /admin_actions/);
  assert.match(engine, /offer_inventory_events/);
  assert.match(engine, /"_migrations"/);
  assert.match(engine, /points_to_non_admin/);
});
