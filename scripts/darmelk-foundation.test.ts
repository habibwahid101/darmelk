import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("foundation tree is 1+3+9+27+81 = 121 with exact 3-wide ancestry", async () => {
  const { buildFoundationTree, assertTreeShape, FOUNDATION_TOTAL, foundationEmail, referralLinkFor } = await import(
    "../backend/src/engine/foundation.ts"
  );
  const nodes = buildFoundationTree();
  assertTreeShape(nodes);
  assert.equal(nodes.length, FOUNDATION_TOTAL);
  assert.equal(nodes.filter((n) => n.level === 0).length, 1);
  assert.equal(nodes.filter((n) => n.level === 1).length, 3);
  assert.equal(nodes.filter((n) => n.level === 2).length, 9);
  assert.equal(nodes.filter((n) => n.level === 3).length, 27);
  assert.equal(nodes.filter((n) => n.level === 4).length, 81);
  const sample = nodes.find((n) => n.displayName === "HW-2.3.1.2");
  assert.ok(sample);
  assert.equal(sample.parentLabel, "HW-2.3.1");
  const l1 = nodes.filter((n) => n.level === 1).map((n) => n.label);
  assert.deepEqual(l1, ["HW-1", "HW-2", "HW-3"]);
  assert.equal(nodes[0].displayName, "Habib Wahid-Root ID");
  assert.equal(foundationEmail("HW-ROOT"), "hw-root@foundation.darmelk.invalid");
  assert.equal(referralLinkFor("DM-ABC"), "https://darmelk.com/join/DM-ABC");
});

test("clean-production preconditions fail closed on contamination", async () => {
  const { assessCleanFoundationPreconditions } = await import("../backend/src/engine/foundation.ts");
  const clean = {
    admins: [{ user_id: "a", email: "admin@darmelk.test", role: "admin" }],
    nonAdminCount: 0,
    foundationExisting: 0,
    orphanAuthUsers: 0,
    flagshipPresent: true,
    catalogOfferCount: 4,
    migrationCount: 19,
    dependentRecords: {},
  };
  assert.equal(assessCleanFoundationPreconditions(clean).ok, true);
  assert.equal(assessCleanFoundationPreconditions({ ...clean, nonAdminCount: 2 }).ok, false);
  assert.equal(assessCleanFoundationPreconditions({ ...clean, foundationExisting: 5 }).ok, false);
  assert.equal(assessCleanFoundationPreconditions({ ...clean, orphanAuthUsers: 1 }).ok, false);
  assert.equal(assessCleanFoundationPreconditions({ ...clean, flagshipPresent: false }).ok, false);
  assert.equal(assessCleanFoundationPreconditions({ ...clean, catalogOfferCount: 0 }).ok, false);
  assert.equal(assessCleanFoundationPreconditions({ ...clean, migrationCount: 0 }).ok, false);
  assert.equal(assessCleanFoundationPreconditions({ ...clean, admins: [] }).ok, false);
});
