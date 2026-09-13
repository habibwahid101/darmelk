-- Additive property context for guest Request to Book.
-- Existing Contact Us rows remain valid (source defaults to contact).
-- Does not create bookings, consume inventory, or touch financial tables.

alter table "contact_requests"
  add column if not exists "offer_slug" text,
  add column if not exists "offer_title" text,
  add column if not exists "source" text not null default 'contact';

update "contact_requests"
   set "source" = 'contact'
 where "source" is null or "source" = '';

alter table "contact_requests" drop constraint if exists "contact_requests_source_check";
alter table "contact_requests"
  add constraint "contact_requests_source_check"
  check ("source" in ('contact', 'request_to_book'));

create index if not exists "contact_requests_source_idx" on "contact_requests" ("source");
create index if not exists "contact_requests_offer_slug_idx" on "contact_requests" ("offer_slug");
