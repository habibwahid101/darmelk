-- Promotion Management: generic campaign engine for booking-period rewards.
-- Additive only. Does not rewrite bookings, commissions, cash-out requests,
-- Leadership Reward, Merchant Credit, activation, or existing offers.

create table if not exists "promotions" (
  "id" text primary key,
  "title" text not null,
  "short_description" text not null default '',
  "description" text not null default '',
  "start_at" timestamptz not null,
  "end_at" timestamptz not null,
  "offer_scope" text not null default 'selected'
    check ("offer_scope" in ('all', 'selected')),
  "terms" text not null default '',
  "terms_version" integer not null default 1 check ("terms_version" > 0),
  "version" integer not null default 1 check ("version" > 0),
  "banner_filename" text,
  "banner_mime" text,
  "banner_data" bytea,
  "status" text not null default 'draft'
    check ("status" in ('draft', 'published', 'closed')),
  "display_order" integer not null default 0,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "created_by_admin_id" text references "members" ("user_id"),
  "published_at" timestamptz,
  "published_by_admin_id" text references "members" ("user_id"),
  "closed_at" timestamptz,
  "closed_by_admin_id" text references "members" ("user_id"),
  check ("end_at" > "start_at")
);

create index if not exists "promotions_status_window_idx"
  on "promotions" ("status", "start_at", "end_at");
create index if not exists "promotions_display_idx"
  on "promotions" ("display_order", "end_at");

create table if not exists "promotion_offers" (
  "promotion_id" text not null references "promotions" ("id"),
  "offer_slug" text not null references "offers" ("slug"),
  primary key ("promotion_id", "offer_slug")
);

create index if not exists "promotion_offers_slug_idx"
  on "promotion_offers" ("offer_slug");

create table if not exists "promotion_rewards" (
  "id" text primary key,
  "promotion_id" text not null references "promotions" ("id"),
  "name" text not null,
  "description" text not null default '',
  "quantity" integer not null default 1 check ("quantity" > 0),
  "value_amount" integer check ("value_amount" is null or "value_amount" >= 0),
  "instructions" text,
  "display_order" integer not null default 0
);

create index if not exists "promotion_rewards_promo_idx"
  on "promotion_rewards" ("promotion_id", "display_order");

create table if not exists "promotion_qualifications" (
  "id" text primary key,
  "promotion_id" text not null references "promotions" ("id"),
  "user_id" text not null references "members" ("user_id"),
  "booking_id" text not null references "bookings" ("id"),
  "offer_slug" text not null,
  "offer_title" text not null,
  "booking_confirmed_at" timestamptz not null,
  "qualified_at" timestamptz not null default now(),
  "promotion_title" text not null,
  "promotion_version" integer not null,
  "terms_snapshot" text not null,
  "terms_version" integer not null,
  "rewards_snapshot" jsonb not null default '[]'::jsonb,
  "start_at" timestamptz not null,
  "end_at" timestamptz not null,
  constraint "promotion_qualifications_user_unique" unique ("promotion_id", "user_id"),
  constraint "promotion_qualifications_booking_unique" unique ("promotion_id", "booking_id")
);

create index if not exists "promotion_qualifications_user_idx"
  on "promotion_qualifications" ("user_id", "qualified_at" desc);
create index if not exists "promotion_qualifications_booking_idx"
  on "promotion_qualifications" ("booking_id");
create index if not exists "promotion_qualifications_promo_idx"
  on "promotion_qualifications" ("promotion_id", "qualified_at" desc);

create table if not exists "promotion_reward_fulfillments" (
  "id" text primary key,
  "qualification_id" text not null references "promotion_qualifications" ("id"),
  "promotion_id" text not null references "promotions" ("id"),
  "user_id" text not null references "members" ("user_id"),
  "reward_name" text not null,
  "reward_description" text not null default '',
  "quantity" integer not null default 1 check ("quantity" > 0),
  "value_amount" integer,
  "instructions" text,
  "display_order" integer not null default 0,
  "status" text not null default 'eligible'
    check ("status" in ('eligible', 'approved', 'fulfilled', 'cancelled', 'reversed')),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "updated_by_admin_id" text references "members" ("user_id"),
  "notes" text
);

create index if not exists "promotion_reward_fulfillments_status_idx"
  on "promotion_reward_fulfillments" ("status");
create index if not exists "promotion_reward_fulfillments_qual_idx"
  on "promotion_reward_fulfillments" ("qualification_id", "display_order");
create index if not exists "promotion_reward_fulfillments_user_idx"
  on "promotion_reward_fulfillments" ("user_id");

create table if not exists "promotion_reward_events" (
  "id" text primary key,
  "fulfillment_id" text not null references "promotion_reward_fulfillments" ("id"),
  "qualification_id" text not null references "promotion_qualifications" ("id"),
  "actor_user_id" text,
  "previous_status" text,
  "new_status" text not null,
  "reason" text,
  "created_at" timestamptz not null default now()
);

create index if not exists "promotion_reward_events_fulfillment_idx"
  on "promotion_reward_events" ("fulfillment_id", "created_at");
