import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("footer removes Explore heading and uses two balanced columns including Career", () => {
  const src = read("src/components/layout/site-footer.tsx");
  assert.doesNotMatch(src, />Explore</);
  assert.match(src, /to="\/properties"/);
  assert.match(src, /How It Works/);
  assert.match(src, /to="\/faq"/);
  assert.match(src, /Contact Us/);
  assert.match(src, /to="\/program-rules"/);
  assert.match(src, /to="\/terms"/);
  assert.match(src, /to="\/privacy"/);
  assert.match(src, /to="\/career"/);
  assert.match(src, /Career/);
  const career = src.indexOf('to="/career"');
  const privacy = src.indexOf('to="/privacy"');
  assert.ok(career > privacy);
});

test("career public listing and job details use email apply only", () => {
  assert.match(read("src/routes/career/index.tsx"), /Career/);
  assert.match(read("src/routes/career/index.tsx"), /No openings right now/);
  assert.match(read("src/routes/career.$slug.tsx"), /JobArticle/);
  assert.match(read("src/components/job-article.tsx"), /Apply via Email/);
  assert.match(read("src/lib/jobs.ts"), /Application for \$\{job\.title\} — Darmelk/);
  assert.match(read("src/lib/jobs.ts"), /mailto:/);
  assert.doesNotMatch(read("src/routes/career.$slug.tsx"), /type="file"/);
  assert.doesNotMatch(read("src/components/job-article.tsx"), /candidate account/i);
});

test("admin career management follows offer CRUD patterns", () => {
  assert.match(read("src/routes/admin/career.index.tsx"), /Career Management/);
  assert.match(read("src/routes/admin/career.index.tsx"), /Add job/);
  assert.match(read("src/routes/admin/career.new.tsx"), /Save draft/);
  assert.match(read("src/routes/admin/career.\$slug.index.tsx"), /Save changes/);
  assert.match(read("src/routes/admin/career.\$slug.preview.tsx"), /Preview/);
  assert.match(read("src/components/layout/admin-shell.tsx"), /Career Management/);
  assert.match(read("backend/src/router.ts"), /requireAdmin/);
  assert.match(read("backend/src/router.ts"), /createJob/);
  assert.match(read("backend/src/engine/jobs.ts"), /Published jobs need an application email/);
});

test("career schema is additive and does not touch bookings", () => {
  const sql = read("migrations/0013_darmelk_career.sql");
  assert.match(sql, /create table if not exists "jobs"/);
  assert.match(sql, /application_email/);
  assert.match(sql, /'draft', 'published', 'closed'/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /bookings/);
  assert.doesNotMatch(sql, /offers/);
});

test("hero copy stays two locked lines and headline scale is reduced", () => {
  const src = read("src/components/landing/landing-page.tsx");
  const css = read("src/styles.css");
  assert.match(src, /<span>Explore Property Opportunities<\/span>/);
  assert.match(src, /<span>With Clarity and Confidence<\/span>/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /clamp\(1\.05rem, 4\.4vw, 1\.5rem\)/);
  assert.match(css, /clamp\(1\.5rem, 3\.1vw, 2\.65rem\)/);
  assert.doesNotMatch(css, /3\.75rem/);
  assert.match(src, /hero-gateway\.jpg/);
  assert.match(src, /Explore Properties/);
  assert.match(src, /How Darmelk Works/);
});

test("previous property management and locked production fixes remain intact", () => {
  const landing = read("src/components/landing/landing-page.tsx");
  const network = read("src/routes/app/network.tsx");
  const withdrawals = read("src/routes/admin/withdrawals.tsx");
  const offers = read("src/lib/offers.ts");
  const engine = read("backend/src/engine/withdrawals.ts");
  assert.match(landing, /<span>Explore Property Opportunities<\/span>/);
  assert.match(offers, /five-star-hotel-share/);
  assert.match(offers, /650_000/);
  assert.match(read("src/routes/admin/offers.index.tsx"), /Properties \/ Offers/);
  assert.match(network, /Current Level Progress/);
  assert.match(withdrawals, /Mark as Paid/);
  assert.match(engine, /lockWithdrawalFunds/);
});
