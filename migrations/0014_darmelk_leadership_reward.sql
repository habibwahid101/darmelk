-- Leadership Reward: one 12-month entitlement round after Level-5 completion.
-- Additive only. Does not rewrite bookings, commissions, withdrawals, or snapshots.

create table if not exists "leadership_reward_cycles" (
  "id" text primary key,
  "user_id" text not null references "members" ("user_id"),
  "level5_completed_at" timestamptz not null,
  "cycle_start_month" date not null,
  "cycle_end_month" date not null,
  "created_at" timestamptz not null default now(),
  constraint "leadership_reward_cycles_user_unique" unique ("user_id"),
  constraint "leadership_reward_cycles_window_check" check ("cycle_end_month" >= "cycle_start_month")
);

create index if not exists "leadership_reward_cycles_start_idx"
  on "leadership_reward_cycles" ("cycle_start_month");

create table if not exists "leadership_reward_tier_events" (
  "id" text primary key,
  "cycle_id" text not null references "leadership_reward_cycles" ("id"),
  "user_id" text not null references "members" ("user_id"),
  "tier" integer not null check ("tier" in (25000, 50000, 100000)),
  "eligible_at" timestamptz not null,
  "effective_month" date not null,
  "applies_in_cycle" boolean not null,
  "evidence" jsonb not null default '[]'::jsonb,
  "created_at" timestamptz not null default now(),
  constraint "leadership_reward_tier_events_unique" unique ("cycle_id", "tier")
);

create index if not exists "leadership_reward_tier_events_user_idx"
  on "leadership_reward_tier_events" ("user_id", "tier");

create table if not exists "leadership_reward_entitlements" (
  "id" text primary key,
  "cycle_id" text not null references "leadership_reward_cycles" ("id"),
  "user_id" text not null references "members" ("user_id"),
  "reward_month" date not null,
  "cycle_month" smallint not null check ("cycle_month" between 1 and 12),
  "tier" integer not null check ("tier" in (25000, 50000, 100000)),
  "amount" integer not null check ("amount" > 0),
  "status" text not null default 'earned'
    check ("status" in ('upcoming', 'earned', 'paid', 'reversed')),
  "basis" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "paid_at" timestamptz,
  "reversed_at" timestamptz,
  "reversed_by_admin_id" text references "members" ("user_id"),
  "reversal_reason" text,
  constraint "leadership_reward_entitlements_month_unique" unique ("cycle_id", "reward_month")
);

create index if not exists "leadership_reward_entitlements_user_idx"
  on "leadership_reward_entitlements" ("user_id", "reward_month");
