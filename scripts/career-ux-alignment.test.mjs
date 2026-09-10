import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("issue A: Gate 2 Filled sits on the true center axis", () => {
  const src = read("src/routes/app/qualification.tsx");
  assert.match(src, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(src, /text-left font-medium">Level</);
  assert.match(src, /min-w-\[4\.5rem\] text-center font-medium">Filled</);
  assert.match(src, /text-right font-medium">Capacity</);
  assert.match(src, /text-left font-medium">Level \{level\.level\}</);
  assert.match(src, /text-center tabular-nums/);
  assert.match(src, /text-right tabular-nums">\{level\.positions\}</);
  assert.match(src, /\{i \+ 1\} · \{confirmed \? "Confirmed" : "Waiting"\}/);
  assert.match(src, /COMMISSION_LEVELS/);
  assert.match(src, /counts\[level\.level\]/);
  assert.doesNotMatch(src, /overflow-x-auto/);
  assert.doesNotMatch(src, /min-w-\[24rem\]/);
});

test("issue B: listing deadline aligns with location text, not the icon", () => {
  const listing = read("src/routes/career/index.tsx");
  const article = read("src/components/job-article.tsx");
  assert.match(listing, /JobPlaceMeta/);
  assert.match(listing, /deadline=\{job\.applicationDeadline\}/);
  assert.match(article, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
  assert.match(article, /Apply by \{formatWhen\(deadline\)\}/);
  assert.match(article, /MapPin/);
});

test("issue C: career pages do not double-pad the shared header offset", () => {
  const listing = read("src/routes/career/index.tsx");
  const detail = read("src/routes/career.$slug.tsx");
  const rootLayout = read("src/routes/__root.tsx");
  assert.match(rootLayout, /pt-16 md:pt-\[4\.25rem\]/);
  assert.match(listing, /pt-10 md:pt-14/);
  assert.match(detail, /pt-10 md:pt-14/);
  assert.doesNotMatch(listing, /pt-24 md:pt-28/);
  assert.doesNotMatch(detail, /pt-24 md:pt-28/);
});

test("issue D–I: job identity, apply CTA, role information, and back navigation", () => {
  const article = read("src/components/job-article.tsx");
  const detail = read("src/routes/career.$slug.tsx");
  assert.match(detail, /text-pine">Career</);
  assert.match(detail, /showApply showBack/);
  assert.match(article, /<h1 className="font-display text-3xl/);
  assert.match(article, /Apply via Email/);
  assert.match(article, /applyMailto/);
  assert.match(article, /aria-label=\{applyLabel\}/);
  assert.doesNotMatch(article, /break-all text-sm text-muted">\{job\.applicationEmail\}/);
  assert.match(article, /← Back to all openings/);
  assert.match(article, /to="\/career"/);
  assert.doesNotMatch(detail, />All openings</);
  assert.match(article, />Role information</);
  assert.match(article, /sm:grid-cols-2/);
  assert.match(article, /label="Vacancy"/);
  assert.match(article, /label="Salary \/ compensation"/);
  assert.match(article, /label="Education"/);
  assert.match(article, /label="Experience"/);
  assert.match(article, /label="Working hours"/);
  assert.match(article, /title="Job description"/);
  assert.match(article, /title="Benefits"/);
  assert.match(article, /max-w-prose/);
  assert.match(article, /job\.vacancy/);
  assert.match(article, /job\.compensation/);
  assert.match(article, /job\.benefits/);
});

test("career data helpers and admin management stay intact", () => {
  const jobs = read("src/lib/jobs.ts");
  const admin = read("src/routes/admin/career.index.tsx");
  const form = read("src/components/admin/job-form.tsx");
  assert.match(jobs, /mailto:\$\{email\}\?subject=/);
  assert.match(jobs, /isJobOpen/);
  assert.match(admin, /Career Management/);
  assert.match(form, /Job description/);
});
