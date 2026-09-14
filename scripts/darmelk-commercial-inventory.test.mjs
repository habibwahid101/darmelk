import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("commercial inventory migration is additive and does not rewrite history", () => {
  const sql = read("migrations/0018_darmelk_commercial_inventory.sql");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.match(sql, /alter table "offers"/);
  assert.match(sql, /full_payment_price/);
  assert.match(sql, /installment_enabled/);
  assert.match(sql, /total_quantity/);
  assert.match(sql, /offer_inventory_events/);
  assert.match(sql, /unique \("booking_id", "event_type"\)/);
  assert.match(sql, /confirmed', 'activated', 'reversed/);
  assert.match(sql, /on conflict \("booking_id", "event_type"\) do nothing/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(statements, /update "bookings" set "booking_amount"/);
  assert.doesNotMatch(statements, /update "booking_snapshots"/);
  assert.doesNotMatch(sql, /reserved_quantity/);
});

test("inventory consume happens on confirm, pending and enquiry do not reserve, reverse does not restore", () => {
  const bookings = read("backend/src/engine/bookings.ts");
  const inventory = read("backend/src/engine/inventory.ts");
  assert.match(bookings, /consumeInventoryForConfirmation/);
  assert.match(bookings, /full_payment_price, full_payment_deadline_days, installment_enabled/);
  assert.match(bookings, /No remaining quantity for this property/);
  assert.match(bookings, /Inventory is not restored/);
  const confirm = bookings.slice(bookings.indexOf("export async function confirmBooking"));
  assert.match(confirm, /consumeInventoryForConfirmation/);
  const create = bookings.slice(bookings.indexOf("export async function createBooking"), bookings.indexOf("export async function confirmBooking"));
  assert.doesNotMatch(create, /insert into offer_inventory_events/);
  const reverse = bookings.slice(bookings.indexOf("export async function reverseBooking"));
  assert.doesNotMatch(reverse, /offer_inventory_events/);
  assert.doesNotMatch(reverse, /restore/);
  const cancel = bookings.slice(bookings.indexOf("export async function cancelBooking"), bookings.indexOf("export async function reverseBooking"));
  assert.doesNotMatch(cancel, /offer_inventory_events/);
  assert.match(inventory, /select slug, total_quantity from offers where slug = \$1 for update/);
  assert.match(inventory, /offer_sold_out/);
  assert.match(inventory, /Reserved quantity is deferred/);
  assert.match(inventory, /code === "23505"/);
  assert.match(inventory, /reserved: null/);
});

test("one offer source of truth is extended, not duplicated", () => {
  const offers = read("backend/src/engine/offers.ts");
  const inventory = read("backend/src/engine/inventory.ts");
  const form = read("src/components/admin/offer-form.tsx");
  assert.match(offers, /total_quantity/);
  assert.match(offers, /assertTotalQuantityAllowed/);
  assert.match(inventory, /quantity_below_sold/);
  assert.match(offers, /economicsChanged/);
  assert.match(offers, /installment_count_required/);
  assert.doesNotMatch(offers, /growth_quantity|marketplace_quantity|separate stock/i);
  assert.match(form, /Payment plan/);
  assert.match(form, /Inventory/);
  assert.match(form, /Growth qualification/);
  assert.match(form, /Installments are available/);
  assert.match(form, /Cannot go below sold/);
  assert.match(form, /Not reserved at request/);
  assert.match(form, /This is not stock/);
  assert.doesNotMatch(form, /window\.prompt/);
});

test("public marketplace shows commercial terms without Growth-only mechanics", () => {
  const detail = read("src/routes/properties.$slug.tsx");
  const terms = read("src/components/offer-commercial-terms.tsx");
  const card = read("src/components/property-card.tsx");
  const book = read("src/routes/app/book.$slug.tsx");
  assert.match(detail, /OfferCommercialTerms/);
  assert.match(detail, /variant="public"/);
  assert.match(detail, /Request to Book/);
  assert.match(detail, /Sold out/);
  assert.doesNotMatch(detail, /Qualification benefit/);
  assert.doesNotMatch(detail, /Commission-eligible/);
  assert.match(terms, /Full payment price/);
  assert.match(terms, /Available quantity/);
  assert.match(terms, /variant === "growth"/);
  assert.match(card, /Sold out/);
  assert.match(book, /variant="growth"/);
  assert.match(book, /This property is sold out/);
});

test("shared inventory is used by both General and Growth booking of the same offer", () => {
  const smoke = read("backend/src/smoke-test.ts");
  assert.match(smoke, /qa-shared-inventory/);
  assert.match(smoke, /General and Growth both see offer_sold_out on the same stock/);
  assert.match(smoke, /Request to Book is not a reservation/);
  assert.match(smoke, /reversal does not restore inventory/);
  assert.match(smoke, /quantity-only edits do not bump offer version/);
  assert.match(smoke, /historical flagship snapshots do not invent missing commercial terms/);
  assert.match(smoke, /payment approval confirms, activates, snapshots new terms/);
});
