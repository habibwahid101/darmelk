-- Career Management v1. Additive only. Email-apply jobs; no candidate accounts.

create table if not exists "jobs" (
  "slug" text primary key,
  "title" text not null,
  "department" text not null,
  "location" text not null,
  "employment_type" text not null,
  "vacancy" integer,
  "compensation" text not null default '',
  "education" text not null default '',
  "experience" text not null default '',
  "skills" jsonb not null default '[]'::jsonb,
  "description" text not null default '',
  "responsibilities" jsonb not null default '[]'::jsonb,
  "requirements" jsonb not null default '[]'::jsonb,
  "benefits" jsonb not null default '[]'::jsonb,
  "working_hours" text not null default '',
  "application_email" text not null default '',
  "application_deadline" date,
  "status" text not null default 'draft' check ("status" in ('draft', 'published', 'closed')),
  "display_order" integer not null default 0,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create index if not exists "jobs_status_idx" on "jobs" ("status", "display_order", "created_at");
