-- Additive Terms / consent audit. Does not rewrite activation, payment,
-- sponsor, network, booking, merchant, or ledger history.
-- Documents themselves are versioned in application code; this table stores
-- immutable acceptance rows keyed by document + version.

create table if not exists "user_consents" (
  "id" text primary key,
  "user_id" text not null references "members" ("user_id"),
  "document_key" text not null
    check ("document_key" in (
      'GENERAL_TERMS',
      'PRIVACY_POLICY',
      'PROPERTY_BOOKING_TERMS',
      'GROWTH_PROGRAM_TERMS',
      'GROWTH_ACTIVATION_TERMS',
      'DARMELK_PAYMENT_TERMS',
      'MERCHANT_PAYMENT_TERMS',
      'PROMOTION_TERMS'
    )),
  "document_version" text not null,
  "context" text not null
    check ("context" in (
      'signup',
      'growth_activation',
      'booking',
      'merchant_bundle',
      'merchant_payment',
      'promotion'
    )),
  "reference_id" text,
  "reference_key" text not null default '',
  "metadata" jsonb not null default '{}'::jsonb,
  "accepted_at" timestamptz not null default now(),
  unique ("user_id", "document_key", "document_version", "context", "reference_key")
);

create index if not exists "user_consents_user_idx"
  on "user_consents" ("user_id", "accepted_at" desc);
