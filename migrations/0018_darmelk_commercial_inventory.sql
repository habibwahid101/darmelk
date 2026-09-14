-- Additive commercial terms + shared inventory.
-- Does not rewrite historical booking economics or ledgers.
-- Pending bookings do not reserve. Confirmed units consume exactly once.
-- Reversal does not restore stock.

alter table "offers"
  add column if not exists "full_payment_price" integer,
  add column if not exists "full_payment_deadline_days" integer,
  add column if not exists "installment_enabled" boolean not null default false,
  add column if not exists "installment_count" integer,
  add column if not exists "installment_frequency" text,
  add column if not exists "installment_amount" integer,
  add column if not exists "installment_duration_months" integer,
  add column if not exists "first_installment_due_rule" text,
  add column if not exists "grace_period_days" integer,
  add column if not exists "total_quantity" integer;

alter table "offers" drop constraint if exists "offers_full_payment_price_check";
alter table "offers" add constraint "offers_full_payment_price_check"
  check ("full_payment_price" is null or "full_payment_price" > 0);

alter table "offers" drop constraint if exists "offers_full_payment_deadline_days_check";
alter table "offers" add constraint "offers_full_payment_deadline_days_check"
  check ("full_payment_deadline_days" is null or "full_payment_deadline_days" > 0);

alter table "offers" drop constraint if exists "offers_installment_count_check";
alter table "offers" add constraint "offers_installment_count_check"
  check ("installment_count" is null or "installment_count" > 0);

alter table "offers" drop constraint if exists "offers_installment_frequency_check";
alter table "offers" add constraint "offers_installment_frequency_check"
  check ("installment_frequency" is null or "installment_frequency" in ('monthly', 'quarterly', 'yearly'));

alter table "offers" drop constraint if exists "offers_installment_amount_check";
alter table "offers" add constraint "offers_installment_amount_check"
  check ("installment_amount" is null or "installment_amount" > 0);

alter table "offers" drop constraint if exists "offers_installment_duration_months_check";
alter table "offers" add constraint "offers_installment_duration_months_check"
  check ("installment_duration_months" is null or "installment_duration_months" > 0);

alter table "offers" drop constraint if exists "offers_grace_period_days_check";
alter table "offers" add constraint "offers_grace_period_days_check"
  check ("grace_period_days" is null or "grace_period_days" >= 0);

alter table "offers" drop constraint if exists "offers_total_quantity_check";
alter table "offers" add constraint "offers_total_quantity_check"
  check ("total_quantity" is null or "total_quantity" >= 0);

alter table "bookings"
  add column if not exists "full_payment_price" integer,
  add column if not exists "full_payment_deadline_days" integer,
  add column if not exists "installment_enabled" boolean not null default false,
  add column if not exists "installment_count" integer,
  add column if not exists "installment_frequency" text,
  add column if not exists "installment_amount" integer,
  add column if not exists "installment_duration_months" integer,
  add column if not exists "first_installment_due_rule" text,
  add column if not exists "grace_period_days" integer;

alter table "booking_snapshots"
  add column if not exists "full_payment_price" integer,
  add column if not exists "full_payment_deadline_days" integer,
  add column if not exists "installment_enabled" boolean not null default false,
  add column if not exists "installment_count" integer,
  add column if not exists "installment_frequency" text,
  add column if not exists "installment_amount" integer,
  add column if not exists "installment_duration_months" integer,
  add column if not exists "first_installment_due_rule" text,
  add column if not exists "grace_period_days" integer;

create table if not exists "offer_inventory_events" (
  "id" text primary key,
  "offer_slug" text not null references "offers" ("slug"),
  "booking_id" text not null references "bookings" ("id"),
  "event_type" text not null check ("event_type" in ('consume')),
  "quantity" integer not null default 1 check ("quantity" = 1),
  "created_at" timestamptz not null default now(),
  constraint "offer_inventory_events_booking_type_unique" unique ("booking_id", "event_type")
);

create index if not exists "offer_inventory_events_offer_idx"
  on "offer_inventory_events" ("offer_slug", "event_type");

-- Record already-binding bookings as consumed units so later total-quantity
-- configuration counts committed history. Does not invent offer stock.
insert into "offer_inventory_events" ("id", "offer_slug", "booking_id", "event_type", "quantity")
select 'inv_' || "id", "offer_slug", "id", 'consume', 1
  from "bookings"
 where "status" in ('confirmed', 'activated', 'reversed')
on conflict ("booking_id", "event_type") do nothing;
