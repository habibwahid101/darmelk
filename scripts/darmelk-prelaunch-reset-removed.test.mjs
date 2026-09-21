import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const REMOVED = [
  "backend/src/engine/prelaunch-reset.ts",
  "backend/src/engine/prelaunch-reset-http.ts",
  "backend/src/prelaunch-reset-smoke.ts",
  "backend/src/prelaunch-reset-smoke-main.ts",
  "src/lib/prelaunch-reset-api.ts",
  "src/routes/admin/maintenance.prelaunch-reset.tsx",
  "scripts/darmelk-prelaunch-reset-preview.test.mjs",
];

test("temporary prelaunch reset execution surfaces are gone", () => {
  for (const rel of REMOVED) {
    assert.equal(existsSync(join(root, rel)), false, rel);
  }

  const handler = read("backend/src/handler.ts");
  const workflow = read(".github/workflows/deploy-backend.yml");
  const smokeBuild = read("backend/esbuild-smoke.mjs");
  const tsconfig = read("backend/tsconfig.json");

  assert.doesNotMatch(handler, /prelaunch-reset|registerPrelaunchReset/);
  assert.doesNotMatch(workflow, /prelaunch-reset/);
  assert.doesNotMatch(smokeBuild, /prelaunch-reset/);
  assert.doesNotMatch(tsconfig, /prelaunch-reset/);
});
