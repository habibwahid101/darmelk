import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("admin withdrawals collect a reference inline instead of prompt/alert", () => {
  const src = read("src/routes/admin/withdrawals.tsx");
  assert.match(src, /Transaction \/ Reference ID/);
  assert.match(src, /Mark as Paid/);
  assert.match(src, /!canPay|!reference\.trim/);
  assert.doesNotMatch(src, /window\.prompt/);
  assert.doesNotMatch(src, /window\.alert/);
  assert.doesNotMatch(src, /\bprompt\(/);
  assert.doesNotMatch(src, /\balert\(/);
});

test("withdrawal request reserves available without a reservedBalance column", () => {
  const engine = read("backend/src/engine/withdrawals.ts");
  const totals = read("backend/src/engine/commissions.ts");
  assert.match(engine, /lockWithdrawalFunds/);
  assert.match(engine, /status === "paid"/);
  assert.match(engine, /cannot reject/);
  assert.match(totals, /reservedWithdrawalTotal/);
  assert.match(totals, /allocatedFromAvailable - reserved/);
  assert.doesNotMatch(engine, /reserved_balance|reservedBalance/);
  assert.doesNotMatch(totals, /reserved_balance|reservedBalance/);
});

test("referral copy action sits on the right of the code row on mobile", () => {
  const src = read("src/routes/app/network.tsx");
  assert.match(src, /flex items-center justify-between gap-3 sm:block/);
  assert.match(src, /sm:mt-4/);
  assert.match(src, /navigator\.clipboard\.writeText\(code\)/);
});

test("booking status badges gain mobile height without changing width behavior", () => {
  const src = read("src/components/ui/status-badge.tsx");
  assert.match(src, /status === "activated"/);
  assert.match(src, /status === "cancelled"/);
  assert.match(src, /max-sm:min-h-8/);
  assert.match(src, /max-sm:py-1\.5/);
  assert.match(src, /items-center justify-center/);
});

test("network dashboard shows current level progress instead of 363 confirmed members", () => {
  const src = read("src/routes/app/network.tsx");
  assert.match(src, /Current Level Progress/);
  assert.match(src, /Level \$\{level\.level\} — \$\{filled\} of \$\{level\.positions\}/);
  assert.match(src, /more confirmed member/);
  assert.match(src, /Personal Sponsors/);
  assert.match(src, />Total</);
  assert.match(src, /TOTAL_POSITIONS/);
  assert.doesNotMatch(src, /label="Confirmed Members"/);
});
