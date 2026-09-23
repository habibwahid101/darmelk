-- Admin-controlled payment methods and receiving accounts.
-- Additive only. Does not rewrite historical payment_submissions,
-- bookings, activations, commissions, inventory, or foundation rows.
-- Default rows preserve current production method availability:
--   Growth Activation: Bank ON, MFS ON, Merchant OFF
--   Growth Booking:    Bank ON, MFS OFF, Merchant ON

create table if not exists "payment_method_settings" (
  "context" text not null check ("context" in ('growth_activation', 'growth_booking')),
  "method" text not null check ("method" in ('bank', 'mfs', 'merchant')),
  "enabled" boolean not null default false,
  "updated_at" timestamptz not null default now(),
  primary key ("context", "method")
);

insert into "payment_method_settings" ("context", "method", "enabled")
values
  ('growth_activation', 'bank', true),
  ('growth_activation', 'mfs', true),
  ('growth_activation', 'merchant', false),
  ('growth_booking', 'bank', true),
  ('growth_booking', 'mfs', false),
  ('growth_booking', 'merchant', true)
on conflict ("context", "method") do nothing;

create table if not exists "receiving_accounts" (
  "id" text primary key,
  "method" text not null check ("method" in ('bank', 'mfs')),
  "provider" text not null default '',
  "label" text not null,
  "account_number" text not null,
  "account_holder_name" text not null default '',
  "account_type" text not null default '',
  "bank_name" text not null default '',
  "branch" text not null default '',
  "routing_number" text not null default '',
  "instructions" text not null default '',
  "enabled" boolean not null default true,
  "display_order" integer not null default 0,
  "archived_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "created_by_admin_id" text references "members" ("user_id")
);

create index if not exists "receiving_accounts_method_order_idx"
  on "receiving_accounts" ("method", "display_order", "created_at");

create table if not exists "receiving_account_contexts" (
  "account_id" text not null references "receiving_accounts" ("id") on delete cascade,
  "context" text not null check ("context" in ('growth_activation', 'growth_booking')),
  primary key ("account_id", "context")
);

insert into "receiving_accounts" (
  "id", "method", "provider", "label", "account_number", "account_holder_name",
  "account_type", "bank_name", "branch", "routing_number", "instructions",
  "enabled", "display_order"
) values
  (
    'rcv_seed_bkash_primary', 'mfs', 'bkash', 'bKash Merchant',
    '01813212777', 'Darmelk', 'Merchant', '', '', '',
    'Send the exact amount and keep the bKash transaction ID.',
    true, 10
  ),
  (
    'rcv_seed_nagad_primary', 'mfs', 'nagad', 'Nagad Merchant',
    '01813212777', 'Darmelk', 'Merchant', '', '', '',
    'Send the exact amount and keep the Nagad transaction ID.',
    true, 20
  ),
  (
    'rcv_seed_bank_city', 'bank', 'bank', 'Darmelk Bank',
    '1503885023001', 'AIC', '', 'The City Bank PLC', 'Kalurghat, Chattogram', '',
    'Send exactly the amount due. Routing number is not required for this bank destination.',
    true, 10
  )
on conflict ("id") do nothing;

insert into "receiving_account_contexts" ("account_id", "context")
values
  ('rcv_seed_bkash_primary', 'growth_activation'),
  ('rcv_seed_nagad_primary', 'growth_activation'),
  ('rcv_seed_bank_city', 'growth_activation'),
  ('rcv_seed_bank_city', 'growth_booking')
on conflict do nothing;

alter table "payment_submissions"
  add column if not exists "receiving_account_id" text references "receiving_accounts" ("id");

alter table "payment_submissions" drop constraint if exists "payment_submissions_payment_method_check";
alter table "payment_submissions"
  add constraint "payment_submissions_payment_method_check"
  check ("payment_method" ~ '^[a-z][a-z0-9_]{0,31}$');

create index if not exists "payment_submissions_receiving_account_idx"
  on "payment_submissions" ("receiving_account_id");

alter table "merchant_payment_requests"
  add column if not exists "purpose" text not null default 'growth_booking';

alter table "merchant_payment_requests" drop constraint if exists "merchant_payment_requests_purpose_check";
alter table "merchant_payment_requests"
  add constraint "merchant_payment_requests_purpose_check"
  check ("purpose" in ('growth_activation', 'growth_booking'));

alter table "merchant_payment_requests"
  add column if not exists "activation_id" text references "annual_activations" ("id");

alter table "merchant_payment_requests" alter column "booking_id" drop not null;

alter table "merchant_payment_requests" drop constraint if exists "merchant_payment_requests_target_check";
alter table "merchant_payment_requests"
  add constraint "merchant_payment_requests_target_check"
  check (
    ("purpose" = 'growth_booking' and "booking_id" is not null and "activation_id" is null)
    or
    ("purpose" = 'growth_activation' and "activation_id" is not null and "booking_id" is null)
  );

create unique index if not exists "merchant_payment_requests_open_activation_unique"
  on "merchant_payment_requests" ("activation_id")
  where "status" in ('pending', 'approved', 'settled') and "activation_id" is not null;

alter table "merchant_credit_ledger" drop constraint if exists "merchant_credit_ledger_entry_type_check";
alter table "merchant_credit_ledger"
  add constraint "merchant_credit_ledger_entry_type_check"
  check ("entry_type" in (
    'purchased_credit_issued',
    'bonus_credit_issued',
    'booking_payment_reserved',
    'booking_payment_settled',
    'activation_payment_reserved',
    'activation_payment_settled',
    'reservation_released',
    'reversal',
    'admin_adjustment'
  ));
