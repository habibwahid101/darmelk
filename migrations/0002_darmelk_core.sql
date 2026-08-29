-- Darmelk core schema: members, offers, bookings, immutable booking snapshots.
--
-- Applied by the Lambda migration runner (backend/src/migrate.ts), which reuses
-- the same ordered-file / `_migrations` bookkeeping as scripts/migrate.mjs.
-- Builds on migrations/0001_auth.sql ("user" table owned by Better Auth).
--
-- Business rules encoded here (see also 0003_darmelk_ledger.sql):
--   * Offers are NEVER hard-coded amounts in application code — every booking
--     freezes its own retail/booking/qualification-benefit figures from the
--     offer row at booking time, and again (immutably) at activation time.
--   * "members" tracks TWO distinct relationships:
--       sponsor_user_id          -> who personally referred this member
--                                    (used for the "sponsor 3" qualification test)
--       network_parent_user_id / network_slot
--                                 -> position in the unified 3x5 forced matrix
--                                    (used for commission flow, may differ from
--                                    sponsor via spillover once a sponsor's 3
--                                    matrix slots are full)

create table if not exists "offers" (
  "slug" text primary key,
  "title" text not null,
  "category" text not null,
  "category_slug" text not null,
  "location" text,
  "image" text,
  "hero_image" text,
  "retail_value" integer not null check ("retail_value" > 0),
  "booking_amount" integer not null check ("booking_amount" > 0),
  "qualification_benefit" integer not null check ("qualification_benefit" > 0),
  "status" text not null default 'available' check ("status" in ('available', 'coming-soon')),
  "flagship" boolean not null default false,
  "summary" text not null default '',
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "members" (
  "user_id" text primary key references "user" ("id") on delete cascade,
  "referral_code" text not null unique,
  "phone" text not null default '',
  "role" text not null default 'member' check ("role" in ('member', 'admin')),

  -- Personal sponsorship (referral) relationship — used for qualification's
  -- "personally sponsor 3 eligible activated members" test.
  "sponsor_user_id" text references "members" ("user_id"),

  -- Unified 3x5 network (forced matrix) placement — used for commission flow.
  -- A member's matrix parent may differ from their sponsor (spillover) once
  -- the sponsor's 3 direct matrix slots are occupied.
  "network_parent_user_id" text references "members" ("user_id"),
  "network_slot" smallint check ("network_slot" in (1, 2, 3)),

  "onboarding_complete" boolean not null default false,

  -- Annual activation (BDT 1,000) — financially separate from booking economics.
  "activation_status" text not null default 'inactive'
    check ("activation_status" in ('inactive', 'pending', 'active', 'expired')),
  "activation_expires_at" timestamptz,

  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),

  constraint "members_network_parent_slot_unique" unique ("network_parent_user_id", "network_slot")
);

create index if not exists "members_sponsor_idx" on "members" ("sponsor_user_id");
create index if not exists "members_network_parent_idx" on "members" ("network_parent_user_id");
create index if not exists "members_referral_code_idx" on "members" ("referral_code");

create table if not exists "bookings" (
  "id" text primary key,
  "user_id" text not null references "members" ("user_id"),
  "offer_slug" text not null references "offers" ("slug"),

  -- Economics frozen from the offer AT BOOKING TIME. Never re-read from
  -- "offers" after this row is written — an offer's price can change for
  -- future bookings without altering a member's own booked terms.
  "retail_value" integer not null,
  "booking_amount" integer not null,
  "qualification_benefit" integer not null,

  "status" text not null default 'pending'
    check ("status" in ('pending', 'confirmed', 'activated', 'cancelled', 'reversed')),

  "created_at" timestamptz not null default now(),
  "confirmed_at" timestamptz,
  "activated_at" timestamptz,
  "cancelled_at" timestamptz,

  "confirmed_by_admin_id" text references "members" ("user_id"),
  "cancelled_by_admin_id" text references "members" ("user_id")
);

create index if not exists "bookings_user_idx" on "bookings" ("user_id");
create index if not exists "bookings_status_idx" on "bookings" ("status");
create index if not exists "bookings_offer_idx" on "bookings" ("offer_slug");

-- Immutable booking economics snapshot, written ONCE when a booking is
-- activated. Never updated or deleted afterward — corrections happen via new
-- ledger/reversal rows elsewhere, never by editing a snapshot in place.
create table if not exists "booking_snapshots" (
  "id" text primary key,
  "booking_id" text not null unique references "bookings" ("id"),
  "user_id" text not null references "members" ("user_id"),
  "offer_slug" text not null,
  "offer_title" text not null,
  "retail_value" integer not null,
  "booking_amount" integer not null,
  "qualification_benefit" integer not null,
  "activated_at" timestamptz not null,
  "created_at" timestamptz not null default now()
);

-- Idempotency support for mutating API calls (booking creation, activation
-- requests, withdrawal requests, admin status changes, ...). Callers send an
-- `Idempotency-Key` header; a repeated key within its scope replays the
-- original recorded response instead of re-executing the operation.
create table if not exists "idempotency_keys" (
  "key" text not null,
  "endpoint" text not null,
  "user_id" text,
  "request_hash" text not null,
  "response_status" integer not null,
  "response_body" jsonb not null,
  "created_at" timestamptz not null default now(),
  primary key ("key", "endpoint")
);

create index if not exists "idempotency_keys_created_idx" on "idempotency_keys" ("created_at");
