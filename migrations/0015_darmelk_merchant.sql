-- Merchant / Reseller: prepaid credit rail for property booking payments.
-- Additive only. Does not rewrite bookings, commissions, withdrawals,
-- Leadership Reward, activation, or existing payment submissions.

alter table "payment_submissions" drop constraint if exists "payment_submissions_target_type_check";
alter table "payment_submissions" add constraint "payment_submissions_target_type_check"
  check ("target_type" in ('activation', 'booking', 'merchant_bundle'));

create table if not exists "merchant_bundles" (
  "id" text primary key,
  "name" text not null,
  "description" text not null default '',
  "purchase_amount" integer not null check ("purchase_amount" > 0),
  "purchased_credit" integer not null check ("purchased_credit" > 0),
  "bonus_credit" integer not null default 0 check ("bonus_credit" >= 0),
  "gifts" jsonb not null default '[]'::jsonb,
  "terms" text not null default '',
  "terms_version" integer not null default 1 check ("terms_version" > 0),
  "status" text not null default 'draft'
    check ("status" in ('draft', 'active', 'inactive')),
  "version" integer not null default 1 check ("version" > 0),
  "display_order" integer not null default 0,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create index if not exists "merchant_bundles_status_idx"
  on "merchant_bundles" ("status", "display_order");

create table if not exists "merchants" (
  "user_id" text primary key references "members" ("user_id"),
  "status" text not null default 'pending'
    check ("status" in ('pending', 'active', 'suspended', 'inactive')),
  "activated_at" timestamptz,
  "purchased_issued" integer not null default 0 check ("purchased_issued" >= 0),
  "bonus_issued" integer not null default 0 check ("bonus_issued" >= 0),
  "available" integer not null default 0 check ("available" >= 0),
  "reserved" integer not null default 0 check ("reserved" >= 0),
  "settled" integer not null default 0 check ("settled" >= 0),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create index if not exists "merchants_status_idx" on "merchants" ("status");

create table if not exists "merchant_bundle_purchases" (
  "id" text primary key,
  "user_id" text not null references "members" ("user_id"),
  "bundle_id" text not null references "merchant_bundles" ("id"),
  "bundle_version" integer not null,
  "bundle_name" text not null,
  "purchase_amount" integer not null check ("purchase_amount" > 0),
  "purchased_credit" integer not null check ("purchased_credit" > 0),
  "bonus_credit" integer not null check ("bonus_credit" >= 0),
  "gifts_snapshot" jsonb not null default '[]'::jsonb,
  "terms_snapshot" text not null,
  "terms_version" integer not null,
  "terms_accepted" boolean not null,
  "terms_accepted_at" timestamptz not null,
  "status" text not null default 'pending'
    check ("status" in ('pending', 'confirmed', 'rejected')),
  "created_at" timestamptz not null default now(),
  "confirmed_at" timestamptz,
  "rejected_at" timestamptz,
  "confirmed_by_admin_id" text references "members" ("user_id")
);

create index if not exists "merchant_bundle_purchases_user_idx"
  on "merchant_bundle_purchases" ("user_id", "created_at" desc);
create index if not exists "merchant_bundle_purchases_status_idx"
  on "merchant_bundle_purchases" ("status");

create table if not exists "merchant_payment_requests" (
  "id" text primary key,
  "booking_id" text not null references "bookings" ("id"),
  "customer_user_id" text not null references "members" ("user_id"),
  "merchant_user_id" text not null references "merchants" ("user_id"),
  "amount" integer not null check ("amount" > 0),
  "offer_slug" text not null,
  "offer_title" text not null,
  "status" text not null default 'pending'
    check ("status" in ('pending', 'approved', 'declined', 'cancelled', 'settled', 'reversed')),
  "created_at" timestamptz not null default now(),
  "decided_at" timestamptz,
  "settled_at" timestamptz,
  "reversed_at" timestamptz
);

create unique index if not exists "merchant_payment_requests_open_booking_unique"
  on "merchant_payment_requests" ("booking_id")
  where "status" in ('pending', 'approved', 'settled');
create index if not exists "merchant_payment_requests_merchant_idx"
  on "merchant_payment_requests" ("merchant_user_id", "status", "created_at" desc);
create index if not exists "merchant_payment_requests_customer_idx"
  on "merchant_payment_requests" ("customer_user_id", "created_at" desc);

create table if not exists "merchant_credit_ledger" (
  "id" text primary key,
  "merchant_user_id" text not null references "merchants" ("user_id"),
  "entry_type" text not null check ("entry_type" in (
    'purchased_credit_issued',
    'bonus_credit_issued',
    'booking_payment_reserved',
    'booking_payment_settled',
    'reservation_released',
    'reversal',
    'admin_adjustment'
  )),
  "amount" integer not null check ("amount" > 0),
  "available_delta" integer not null,
  "reserved_delta" integer not null,
  "settled_delta" integer not null,
  "purchased_issued_delta" integer not null default 0,
  "bonus_issued_delta" integer not null default 0,
  "bundle_purchase_id" text references "merchant_bundle_purchases" ("id"),
  "payment_request_id" text references "merchant_payment_requests" ("id"),
  "booking_id" text,
  "actor_user_id" text,
  "reason" text,
  "idempotency_key" text not null,
  "created_at" timestamptz not null default now(),
  constraint "merchant_credit_ledger_idempotency_unique" unique ("idempotency_key")
);

create index if not exists "merchant_credit_ledger_merchant_idx"
  on "merchant_credit_ledger" ("merchant_user_id", "created_at" desc);
create index if not exists "merchant_credit_ledger_type_idx"
  on "merchant_credit_ledger" ("entry_type");
create index if not exists "merchant_credit_ledger_booking_idx"
  on "merchant_credit_ledger" ("booking_id");

create table if not exists "merchant_gift_fulfillments" (
  "id" text primary key,
  "purchase_id" text not null references "merchant_bundle_purchases" ("id"),
  "merchant_user_id" text not null references "merchants" ("user_id"),
  "gift_label" text not null,
  "quantity" integer not null default 1 check ("quantity" > 0),
  "status" text not null default 'pending'
    check ("status" in ('pending', 'fulfilled', 'cancelled')),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "fulfilled_at" timestamptz,
  "updated_by_admin_id" text references "members" ("user_id"),
  "notes" text
);

create index if not exists "merchant_gift_fulfillments_status_idx"
  on "merchant_gift_fulfillments" ("status");
create index if not exists "merchant_gift_fulfillments_merchant_idx"
  on "merchant_gift_fulfillments" ("merchant_user_id");
