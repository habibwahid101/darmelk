import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("prelaunch reset execute is admin-protected, confirmed, and transactional", () => {
  const handler = read("backend/src/handler.ts");
  const http = read("backend/src/engine/prelaunch-reset-http.ts");
  const engine = read("backend/src/engine/prelaunch-reset.ts");
  const page = read("src/routes/admin/maintenance.prelaunch-reset.tsx");
  const client = read("src/lib/prelaunch-reset-api.ts");
  const smoke = read("backend/src/prelaunch-reset-smoke.ts");
  const smokeMain = read("backend/src/prelaunch-reset-smoke-main.ts");

  assert.match(handler, /registerPrelaunchResetRoutes/);
  assert.match(http, /app\.get\("\/api\/admin\/maintenance\/prelaunch-reset\/preview"/);
  assert.match(http, /app\.post\("\/api\/admin\/maintenance\/prelaunch-reset\/execute"/);
  assert.match(http, /requireAdmin\(client, adminId\)/);
  assert.match(http, /executePrelaunchReset/);
  assert.match(engine, /RESET DARMELK PRELAUNCH DATA/);
  assert.match(engine, /confirmation_required/);
  assert.match(engine, /already_clean/);
  assert.match(engine, /ONE_TIME_PRELAUNCH_RESET/);
  assert.match(engine, /delete from/);
  assert.match(engine, /executePrelaunchReset/);
  assert.match(engine, /five-star-hotel-share/);
  assert.match(engine, /auth_only_non_admin_users/);
  assert.match(engine, /delete from "user"/);
  assert.match(engine, /flagship_not_cleared|flagship\.sold !== 0/);
  assert.match(engine, /assertDarmelkDatabase/);
  assert.match(engine, /abortAfterClear/);
  assert.match(page, /RESET DARMELK PRELAUNCH DATA/);
  assert.match(page, /createFileRoute\("\/admin\/maintenance\/prelaunch-reset"\)/);
  assert.match(page, /prelaunchResetExecute/);
  assert.match(client, /prelaunchResetPreview/);
  assert.match(client, /prelaunchResetExecute/);
  assert.match(smoke, /forced-rollback|test_rollback_probe|abortAfterClear/);
  assert.match(smoke, /already_clean/);
  assert.match(smokeMain, /runPrelaunchResetSmoke/);
  assert.doesNotMatch(engine, /\bTRUNCATE\b/);
  assert.doesNotMatch(engine, /offers"\)/);
});

test("prelaunch reset does not touch AWS or reusable ledger deletion APIs", () => {
  const engine = read("backend/src/engine/prelaunch-reset.ts");
  const http = read("backend/src/engine/prelaunch-reset-http.ts");
  assert.doesNotMatch(engine, /@aws-sdk|update-function-configuration|CreateVpc|iam:CreateRole/);
  assert.doesNotMatch(http, /\/api\/admin\/ledger\/delete/);
  assert.match(engine, /ONE-TIME PRELAUNCH CLEAN RESET/);
});
