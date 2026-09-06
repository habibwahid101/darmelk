-- Admin Property / Offer Management v1.
-- Additive only: never rewrites historical bookings or snapshots.

alter table "offers"
  add column if not exists "details" text not null default '',
  add column if not exists "features" jsonb not null default '[]'::jsonb,
  add column if not exists "notes" text not null default '',
  add column if not exists "commission_eligible_amount" integer,
  add column if not exists "display_order" integer not null default 0,
  add column if not exists "gallery" jsonb not null default '[]'::jsonb,
  add column if not exists "image_alt" text not null default '',
  add column if not exists "hero_image_alt" text not null default '',
  add column if not exists "version" integer not null default 1;

update "offers"
   set "commission_eligible_amount" = "booking_amount"
 where "commission_eligible_amount" is null;

alter table "offers"
  alter column "commission_eligible_amount" set not null,
  alter column "commission_eligible_amount" set default 0;

alter table "offers" drop constraint if exists "offers_status_check";
alter table "offers"
  add constraint "offers_status_check"
  check ("status" in ('available', 'coming-soon', 'draft', 'published', 'closed'));

update "offers"
   set "status" = 'published', "updated_at" = now()
 where "status" = 'available';

update "offers"
   set "gallery" = '["/images/category-resort.jpg"]'::jsonb
 where "slug" = 'five-star-hotel-share'
   and "gallery" = '[]'::jsonb;

alter table "bookings"
  add column if not exists "commission_eligible_amount" integer,
  add column if not exists "offer_version" integer not null default 1;

update "bookings"
   set "commission_eligible_amount" = "booking_amount"
 where "commission_eligible_amount" is null;

alter table "bookings"
  alter column "commission_eligible_amount" set not null,
  alter column "commission_eligible_amount" set default 0;

alter table "booking_snapshots"
  add column if not exists "commission_eligible_amount" integer,
  add column if not exists "offer_version" integer not null default 1;

update "booking_snapshots"
   set "commission_eligible_amount" = "booking_amount"
 where "commission_eligible_amount" is null;

alter table "booking_snapshots"
  alter column "commission_eligible_amount" set not null,
  alter column "commission_eligible_amount" set default 0;

create table if not exists "offer_media" (
  "id" text primary key,
  "offer_slug" text not null references "offers" ("slug"),
  "kind" text not null check ("kind" in ('cover', 'hero', 'gallery')),
  "sort_order" integer not null default 0,
  "filename" text not null,
  "mime" text not null,
  "bytes" bytea not null,
  "alt" text not null default '',
  "created_at" timestamptz not null default now()
);

create index if not exists "offer_media_offer_idx" on "offer_media" ("offer_slug", "kind", "sort_order");
