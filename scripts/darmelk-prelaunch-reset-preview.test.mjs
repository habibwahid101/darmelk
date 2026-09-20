import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("prelaunch reset is admin-protected, confirmed, and transactional", () => {
  const handler = read("backend/src/handler.ts");
  const http = read("backend/src/engine/prelaunch-reset-http.ts");
  const engine = read("backend/src/engine/prelaunch-reset.ts");
  const page = read("src/routes/admin/maintenance.prelaunch-reset.tsx");
  const client = read("src/lib/api-client.ts");
  const commissions = read("backend/src/engine/commissions.ts");
  const bookings = read("backend/src/engine/bookings.ts");

  assert.match(handler, /registerPrelaunchResetPreview/);
  assert.match(http, /app\.get\("\/api\/admin\/maintenance\/prelaunch-reset\/preview"/);
  assert.match(http, /app\.post\("\/api\/admin\/maintenance\/prelaunch-reset\/execute"/);
  assert.match(http, /requireAdmin\(client, adminId\)/);
  assert.match(http, /assertResetEnvironment/);
  assert.match(http, /confirmation_required/);
  assert.match(http, /RESET_CONFIRMATION/);
  assert.doesNotMatch(http, /app\.delete\(/);

  assert.match(engine, /RESET DARMELK PRELAUNCH DATA/);
  assert.match(engine, /ONE_TIME_PRELAUNCH_RESET/);
  assert.match(engine, /export async function executePrelaunchReset/);
  assert.match(engine, /abortAfterClear/);
  assert.match(engine, /already_clean/);
  assert.match(engine, /delete from members where role <> 'admin'/);
  assert.match(engine, /delete from "user" where id <> all/);
  assert.match(engine, /auth_only_non_admin_users/);
  assert.match(engine, /soldForOffer/);
  assert.match(engine, /five-star-hotel-share/);
  assert.match(engine, /booking_snapshots/);
  assert.match(engine, /reversal_entries/);
  assert.match(engine, /admin_actions/);
  assert.match(engine, /offer_inventory_events/);
  assert.match(engine, /"_migrations"/);
  assert.match(engine, /points_to_non_admin/);
  assert.match(engine, /test_rollback_probe/);

  assert.match(page, /createFileRoute\("\/admin\/maintenance\/prelaunch-reset"\)/);
  assert.match(page, /RESET DARMELK PRELAUNCH DATA/);
  assert.match(page, /prelaunchResetExecute/);
  assert.match(client, /prelaunchResetPreview/);
  assert.match(client, /prelaunchResetExecute/);

  assert.match(commissions, /postCommissionsForBooking/);
  assert.match(bookings, /export async function confirmBooking/);
});
