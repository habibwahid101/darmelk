-- Darmelk financial ledger: commissions, reversals, withdrawals, annual
-- activation payments, and the admin audit log.
--
-- Everything here is append-only. Nothing is ever deleted or have its amount
-- mutated after posting — a correction is always a NEW row (a reversal entry
-- offsetting an earlier one), so the full financial history stays intact and
-- auditable.

-- Commission ledger: one row per (source booking, beneficiary, level).
-- The unique constraint is the idempotency backstop against double-crediting
-- the same booking confirmation twice (e.g. a retried admin action or a
-- re-delivered event) — the app also wraps posting in a single transaction.
create table if not exists "commission_ledger" (
  "id" text primary key,
  "beneficiary_user_id" text not null references "members" ("user_id"),
  "source_booking_id" text not null references "bookings" ("id"),
  "source_user_id" text not null references "members" ("user_id"),
  "level" smallint not null check ("level" between 1 and 5),
  "rate" numeric(4, 3) not null,

  -- The source member's ACTUAL confirmed booking amount this commission was
  -- computed from — never a hard-coded platform-wide figure. amount =
  -- round(source_booking_amount * rate).
  "source_booking_amount" integer not null,
  "amount" integer not null,

  "status" text not null default 'pending'
    check ("status" in ('pending', 'available', 'paid', 'reversed', 'rejected')),

  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),

  constraint "commission_ledger_source_unique" unique ("source_booking_id", "beneficiary_user_id", "level")
);

create index if not exists "commission_ledger_beneficiary_idx" on "commission_ledger" ("beneficiary_user_id");
create index if not exists "commission_ledger_source_booking_idx" on "commission_ledger" ("source_booking_id");

-- Reversal ledger: every reversal is its own row referencing the entry it
-- offsets. The original commission_ledger row's status flips to 'reversed'
-- for fast filtering, but the row itself and its amount are untouched —
-- the reversal_entries row is the audit trail of *why* and *when*.
create table if not exists "reversal_entries" (
  "id" text primary key,
  "commission_ledger_id" text not null references "commission_ledger" ("id"),
  "reversed_amount" integer not null,
  "reason" text not null,
  "reversed_by_admin_id" text references "members" ("user_id"),
  "created_at" timestamptz not null default now()
);

create index if not exists "reversal_entries_commission_idx" on "reversal_entries" ("commission_ledger_id");

-- Withdrawals: member-requested payouts against AVAILABLE commission balance.
-- Approval/rejection is admin-authorized (admin_actions records who/when).
create table if not exists "withdrawals" (
  "id" text primary key,
  "user_id" text not null references "members" ("user_id"),
  "amount" integer not null check ("amount" > 0),
  "status" text not null default 'requested'
    check ("status" in ('requested', 'approved', 'rejected', 'paid')),
  "requested_at" timestamptz not null default now(),
  "decided_at" timestamptz,
  "decided_by_admin_id" text references "members" ("user_id"),
  "paid_at" timestamptz,
  "notes" text
);

create index if not exists "withdrawals_user_idx" on "withdrawals" ("user_id");
create index if not exists "withdrawals_status_idx" on "withdrawals" ("status");

-- Annual activation payments (BDT 1,000) — kept in their own ledger, entirely
-- separate from booking/commission economics.
create table if not exists "annual_activations" (
  "id" text primary key,
  "user_id" text not null references "members" ("user_id"),
  "amount" integer not null default 1000 check ("amount" = 1000),
  "period_start" timestamptz not null,
  "period_end" timestamptz not null,
  "status" text not null default 'pending'
    check ("status" in ('pending', 'active', 'expired', 'rejected')),
  "requested_at" timestamptz not null default now(),
  "decided_at" timestamptz,
  "decided_by_admin_id" text references "members" ("user_id")
);

create index if not exists "annual_activations_user_idx" on "annual_activations" ("user_id");

-- Admin authorization / audit log. Every admin-only mutation (confirm
-- booking, reverse commission, approve withdrawal, grant admin role, ...)
-- writes one row here. Never deleted.
create table if not exists "admin_actions" (
  "id" text primary key,
  "admin_user_id" text not null references "members" ("user_id"),
  "action_type" text not null,
  "target_type" text not null,
  "target_id" text not null,
  "payload" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now()
);

create index if not exists "admin_actions_target_idx" on "admin_actions" ("target_type", "target_id");
create index if not exists "admin_actions_admin_idx" on "admin_actions" ("admin_user_id");
