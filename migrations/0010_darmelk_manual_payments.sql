-- Manual payment evidence, saved payout credentials, and immutable withdrawal
-- destination snapshots. Additive only: historical financial rows are retained.

create table if not exists "payment_submissions" (
  "id" text primary key,
  "target_type" text not null check ("target_type" in ('activation', 'booking')),
  "target_id" text not null,
  "user_id" text not null references "members" ("user_id"),
  "amount" integer not null check ("amount" > 0),
  "payment_method" text not null check ("payment_method" in ('bkash', 'nagad', 'bank')),
  "destination_snapshot" jsonb not null,
  "reference_id" text not null,
  "proof_filename" text not null,
  "proof_mime" text not null,
  "proof_data" bytea not null,
  "notes" text,
  "status" text not null default 'submitted'
    check ("status" in ('submitted', 'under_review', 'approved', 'rejected')),
  "submitted_at" timestamptz not null default now(),
  "reviewed_at" timestamptz,
  "reviewed_by_admin_id" text references "members" ("user_id"),
  "rejection_reason" text
);

create index if not exists "payment_submissions_user_idx" on "payment_submissions" ("user_id");
create index if not exists "payment_submissions_target_idx" on "payment_submissions" ("target_type", "target_id");
create unique index if not exists "payment_submissions_open_target_unique"
  on "payment_submissions" ("target_type", "target_id")
  where "status" in ('submitted', 'under_review', 'approved');

create table if not exists "payout_methods" (
  "id" text primary key,
  "user_id" text not null references "members" ("user_id"),
  "method_type" text not null check ("method_type" in ('bkash', 'nagad', 'bank')),
  "details" jsonb not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  unique ("user_id", "method_type")
);

alter table "withdrawals" add column if not exists "fee_amount" integer;
alter table "withdrawals" add column if not exists "net_amount" integer;
alter table "withdrawals" add column if not exists "payout_method_id" text references "payout_methods" ("id");
alter table "withdrawals" add column if not exists "payout_method_snapshot" jsonb;
alter table "withdrawals" add column if not exists "admin_payment_reference" text;
alter table "withdrawals" add column if not exists "paid_by_admin_id" text references "members" ("user_id");

-- Preserve useful fee/net reporting for historical withdrawals without
-- manufacturing payout credentials or references that never existed.
update "withdrawals"
set "fee_amount" = round("amount" * 0.025),
    "net_amount" = "amount" - round("amount" * 0.025)
where "fee_amount" is null or "net_amount" is null;

create table if not exists "commission_payout_allocations" (
  "id" text primary key,
  "withdrawal_id" text not null references "withdrawals" ("id"),
  "commission_ledger_id" text not null references "commission_ledger" ("id"),
  "amount" integer not null check ("amount" > 0),
  "created_at" timestamptz not null default now(),
  unique ("withdrawal_id", "commission_ledger_id")
);
create index if not exists "commission_payout_allocations_ledger_idx" on "commission_payout_allocations" ("commission_ledger_id");
