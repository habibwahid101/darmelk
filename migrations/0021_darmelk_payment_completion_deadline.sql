-- Fixed payment-completion date for an offer. Additive and nullable.
-- Does not rewrite bookings, booking snapshots, ledgers, or inventory.
-- Existing rows keep null until a new booking freezes the live offer value.

alter table "offers"
  add column if not exists "payment_completion_deadline" date;

alter table "bookings"
  add column if not exists "payment_completion_deadline" date;

alter table "booking_snapshots"
  add column if not exists "payment_completion_deadline" date;

-- Flagship offer only, and only while the new column is empty.
-- This does not touch historical bookings or snapshots.
update "offers"
   set "payment_completion_deadline" = '2028-12-31'
 where "slug" = 'five-star-hotel-share'
   and "payment_completion_deadline" is null;
