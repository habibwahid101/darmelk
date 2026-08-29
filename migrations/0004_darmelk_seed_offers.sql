-- Seed the flagship Darmelk offer. Idempotent (ON CONFLICT DO NOTHING) so
-- re-running this file after an admin has edited the row in production never
-- clobbers their changes.
insert into "offers" (
  "slug", "title", "category", "category_slug", "location", "image", "hero_image",
  "retail_value", "booking_amount", "qualification_benefit", "status", "flagship", "summary"
) values (
  'five-star-hotel-share',
  'Five-Star Hotel Share',
  'Hotel & Resort Shares',
  'hotel-resort-shares',
  'Bangladesh',
  '/images/flagship-suite.jpg',
  '/images/hero-hotel.jpg',
  650000,
  50000,
  600000,
  'available',
  true,
  'A curated hospitality share. Begin with a defined booking amount and progress toward this offer''s qualification benefit.'
)
on conflict ("slug") do nothing;
