import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("issue 1: personal sponsor slots use concise numbered copy", () => {
  const src = read("src/routes/app/qualification.tsx");
  assert.match(src, /\{i \+ 1\} · \{confirmed \? "Confirmed" : "Waiting"\}/);
  assert.doesNotMatch(src, /Waiting on a personal confirmed member/);
  assert.doesNotMatch(src, /Confirmed member/);
  assert.match(src, /\{sponsorCount\} \/ \{PERSONAL_SPONSOR_TARGET\} confirmed/);
});

test("issue 1: slot count stays dynamic 0-3 from sponsorCount", () => {
  const src = read("src/routes/app/qualification.tsx");
  assert.match(src, /Array\.from\(\{ length: PERSONAL_SPONSOR_TARGET \}/);
  assert.match(src, /const confirmed = i < sponsorCount/);
});

test("issue 5: Gate 2 table is table-fixed with no horizontal min-width trap", () => {
  const src = read("src/routes/app/qualification.tsx");
  assert.match(src, /table-fixed/);
  assert.doesNotMatch(src, /min-w-\[24rem\]/);
  assert.doesNotMatch(src, /overflow-x-auto/);
  assert.match(src, />Capacity</);
  assert.match(src, />Filled</);
  assert.match(src, /level\.positions/);
});

test("issue 2: Cancel and Reverse share compact secondary row-action treatment", () => {
  const bookings = read("src/routes/admin/bookings.tsx");
  const cancel = bookings.match(/<Button[\s\S]*?>\s*Cancel\s*<\/Button>/);
  const reverse = bookings.match(/<Button[\s\S]*?>\s*Reverse\s*<\/Button>/);
  assert.ok(cancel, "Cancel button present");
  assert.ok(reverse, "Reverse button present");
  assert.match(cancel[0], /size="sm"/);
  assert.match(reverse[0], /size="sm"/);
  assert.match(cancel[0], /variant="secondary"/);
  assert.match(reverse[0], /variant="secondary"/);
  assert.match(cancel[0], /className="shrink-0"/);
  assert.match(reverse[0], /className="shrink-0"/);
  assert.match(bookings, /flex flex-wrap items-center gap-2/);
});

test("issue 3: withdrawals follow Payment Review right-side status pattern", () => {
  const payments = read("src/routes/admin/payments.tsx");
  const withdrawals = read("src/routes/admin/withdrawals.tsx");
  assert.match(payments, /sm:flex-row sm:items-start sm:justify-between/);
  assert.match(withdrawals, /sm:flex-row sm:items-start sm:justify-between/);
  assert.match(withdrawals, /<StatusBadge status=\{w\.status\}/);
  assert.match(withdrawals, /w\.status === "requested"/);
  assert.match(withdrawals, /w\.status === "approved"/);
  assert.match(withdrawals, /w\.status === "paid"/);
});

test("issue 4: users keep identity left and primary status right", () => {
  const users = read("src/routes/admin/users.tsx");
  assert.match(users, /sm:flex-row sm:items-start sm:justify-between/);
  assert.match(users, /<StatusBadge status=\{m\.activation_status\}/);
  assert.match(users, /<StatusBadge status=\{m\.role\}/);
  assert.match(users, /m\.email/);
  assert.match(users, /m\.referral_code/);
  const activationIdx = users.indexOf("<StatusBadge status={m.activation_status}");
  const roleIdx = users.indexOf("<StatusBadge status={m.role}");
  assert.ok(roleIdx < activationIdx, "role stays with identity; activation is the right-side primary status");
});
