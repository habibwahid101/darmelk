-- Admin-managed Property Booking Terms revisions.
-- Additive only. Does not insert a version, publish new legal text,
-- or rewrite consents, bookings, snapshots, or ledgers.
-- Until an admin publishes a revision, the code document remains current.

create table if not exists "policy_revisions" (
  "id" text primary key,
  "document_key" text not null,
  "version" text not null,
  "title" text not null,
  "effective_date" date not null,
  "summary" text not null default '',
  "body" text not null,
  "status" text not null check ("status" in ('draft', 'published')),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "published_at" timestamptz,
  "created_by_admin_id" text,
  "published_by_admin_id" text,
  constraint "policy_revisions_booking_key_check" check ("document_key" = 'PROPERTY_BOOKING_TERMS'),
  constraint "policy_revisions_key_version_unique" unique ("document_key", "version")
);

create index if not exists "policy_revisions_current_idx"
  on "policy_revisions" ("document_key", "status", "published_at" desc);
