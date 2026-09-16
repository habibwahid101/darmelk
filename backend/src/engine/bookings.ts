import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { postCommissionsForBooking, reverseCommissionsForBooking } from "./commissions.js";
import { consumeInventoryForConfirmation, soldForOffer } from "./inventory.js";
import { requireActiveGrowthProgram } from "./members.js";
import {
  releaseMerchantPaymentForBooking,
  reverseMerchantPaymentForBooking,
  settleMerchantPaymentForBooking,
} from "./merchant.js";
import {
  evaluatePromotionsForConfirmedBooking,
  reversePromotionRewardsForBooking,
} from "./promotions.js";
import { recordConsents, requireCurrentConsentFor } from "./terms.js";

export type Booking = {
  id: string;
  user_id: string;
  offer_slug: string;
  retail_value: number;
  booking_amount: number;
  qualification_benefit: number;
  commission_eligible_amount?: number;
  offer_version?: number;
  full_payment_price?: number | null;
  full_payment_deadline_days?: number | null;
  installment_enabled?: boolean;
  installment_count?: number | null;
  installment_frequency?: string | null;
  installment_amount?: number | null;
  installment_duration_months?: number | null;
  first_installment_due_rule?: string | null;
  grace_period_days?: number | null;
  status: "pending" | "confirmed" | "activated" | "cancelled" | "reversed";
  created_at: string;
  confirmed_at: string | null;
  activated_at: string | null;
  cancelled_at: string | null;
};

type OfferFreeze = {
  slug: string;
  retail_value: number;
  booking_amount: number;
  qualification_benefit: number;
  commission_eligible_amount: number | null;
  version: number | null;
  status: string;
  total_quantity: number | null;
  full_payment_price: number | null;
  full_payment_deadline_days: number | null;
  installment_enabled: boolean;
  installment_count: number | null;
  installment_frequency: string | null;
  installment_amount: number | null;
  installment_duration_months: number | null;
  first_installment_due_rule: string | null;
  grace_period_days: number | null;
};

/** Create a booking, freezing economics from the offer row RIGHT NOW — the
 * booking's amounts never move again even if the offer's price changes later
 * (mixed offers, each keeping its own booked terms). Pending does not reserve
 * inventory. */
export async function createBooking(
  client: PoolClient,
  userId: string,
  offerSlug: string,
  input: { acceptBookingTerms?: unknown } = {},
): Promise<Booking> {
  await requireActiveGrowthProgram(client, userId, "Growth Program activation is required before booking");
  const { rows: offerRows } = await client.query<OfferFreeze>(
    `select slug, retail_value, booking_amount, qualification_benefit,
            coalesce(commission_eligible_amount, booking_amount) as commission_eligible_amount,
            coalesce(version, 1) as version, status, total_quantity,
            full_payment_price, full_payment_deadline_days,
            coalesce(installment_enabled, false) as installment_enabled,
            installment_count, installment_frequency, installment_amount,
            installment_duration_months, first_installment_due_rule, grace_period_days
       from offers where slug = $1`,
    [offerSlug],
  );
  const offer = offerRows[0];
  if (!offer) throw notFound("Offer not found");
  if (offer.status !== "available" && offer.status !== "published") {
    throw badRequest("Offer is not currently available", "offer_unavailable");
  }
  if (offer.total_quantity != null) {
    const sold = await soldForOffer(client, offer.slug);
    if (sold >= offer.total_quantity) {
      throw conflict("No remaining quantity for this property", "offer_sold_out");
    }
  }
  if (input.acceptBookingTerms !== true) {
    throw badRequest("Property Booking Terms must be accepted", "terms_required");
  }

  const id = uid("bk");
  const { rows } = await client.query<Booking>(
    `insert into bookings (
        id, user_id, offer_slug, retail_value, booking_amount, qualification_benefit,
        commission_eligible_amount, offer_version, status,
        full_payment_price, full_payment_deadline_days, installment_enabled,
        installment_count, installment_frequency, installment_amount,
        installment_duration_months, first_installment_due_rule, grace_period_days
      )
     values ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning *`,
    [
      id,
      userId,
      offer.slug,
      offer.retail_value,
      offer.booking_amount,
      offer.qualification_benefit,
      offer.commission_eligible_amount ?? offer.booking_amount,
      offer.version ?? 1,
      offer.full_payment_price,
      offer.full_payment_deadline_days,
      offer.installment_enabled,
      offer.installment_count,
      offer.installment_frequency,
      offer.installment_amount,
      offer.installment_duration_months,
      offer.first_installment_due_rule,
      offer.grace_period_days,
    ],
  );
  const booking = rows[0]!;
  await recordConsents(client, userId, {
    keys: ["PROPERTY_BOOKING_TERMS"],
    context: "booking",
    referenceId: booking.id,
    metadata: {
      offerSlug: offer.slug,
      bookingAmount: offer.booking_amount,
      retailValue: offer.retail_value,
      offerVersion: offer.version ?? 1,
    },
  });
  await requireCurrentConsentFor(
    client,
    userId,
    "PROPERTY_BOOKING_TERMS",
    "booking",
    booking.id,
    "Property Booking Terms must be accepted",
  );
  return booking;
}

/** Admin: confirm a pending booking's payment. Posts commission ledger rows
 * to every matrix ancestor of the booker, computed from THIS booking's own
 * frozen amount. Idempotent (see commissions.ts). Consumes shared inventory
 * exactly once. */
export async function confirmBooking(client: PoolClient, bookingId: string, adminUserId: string): Promise<Booking> {
  const { rows } = await client.query<Booking>(`select * from bookings where id = $1 for update`, [bookingId]);
  const booking = rows[0];
  if (!booking) throw notFound("Booking not found");
  if (booking.status !== "pending") throw conflict(`Booking is ${booking.status}, expected pending`);

  await consumeInventoryForConfirmation(client, { offerSlug: booking.offer_slug, bookingId: booking.id });

  const { rows: updated } = await client.query<Booking>(
    `update bookings set status = 'confirmed', confirmed_at = now(), confirmed_by_admin_id = $2 where id = $1 returning *`,
    [bookingId, adminUserId],
  );
  await settleMerchantPaymentForBooking(client, bookingId);
  // Single qualification entry for every payment rail. Bank approval and
  // Merchant-funded confirmation both reach this function; Merchant approval
  // itself never does.
  await evaluatePromotionsForConfirmedBooking(client, bookingId, adminUserId);
  return updated[0]!;
}

/** Admin: activate a confirmed booking — writes the ONE immutable economics
 * snapshot for this booking. Never called twice for the same booking (the
 * unique constraint on booking_snapshots.booking_id enforces it). */
export async function activateBooking(client: PoolClient, bookingId: string): Promise<Booking> {
  const { rows } = await client.query<Booking & { offer_title?: string }>(
    `select b.*, o.title as offer_title from bookings b join offers o on o.slug = b.offer_slug where b.id = $1 for update`,
    [bookingId],
  );
  const booking = rows[0];
  if (!booking) throw notFound("Booking not found");
  if (booking.status !== "confirmed") throw conflict(`Booking is ${booking.status}, expected confirmed`);

  const { rows: updated } = await client.query<Booking>(
    `update bookings set status = 'activated', activated_at = now() where id = $1 returning *`,
    [bookingId],
  );
  await client.query(
    `insert into booking_snapshots
       (id, booking_id, user_id, offer_slug, offer_title, retail_value, booking_amount, qualification_benefit,
        commission_eligible_amount, offer_version, activated_at,
        full_payment_price, full_payment_deadline_days, installment_enabled, installment_count,
        installment_frequency, installment_amount, installment_duration_months,
        first_installment_due_rule, grace_period_days)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11,$12,$13,$14,$15,$16,$17,$18,$19)
     on conflict (booking_id) do nothing`,
    [
      uid("snap"),
      booking.id,
      booking.user_id,
      booking.offer_slug,
      booking.offer_title ?? booking.offer_slug,
      booking.retail_value,
      booking.booking_amount,
      booking.qualification_benefit,
      booking.commission_eligible_amount ?? booking.booking_amount,
      booking.offer_version ?? 1,
      booking.full_payment_price ?? null,
      booking.full_payment_deadline_days ?? null,
      booking.installment_enabled ?? false,
      booking.installment_count ?? null,
      booking.installment_frequency ?? null,
      booking.installment_amount ?? null,
      booking.installment_duration_months ?? null,
      booking.first_installment_due_rule ?? null,
      booking.grace_period_days ?? null,
    ],
  );
  await postCommissionsForBooking(client, {
    id: booking.id,
    userId: booking.user_id,
    bookingAmount: booking.commission_eligible_amount ?? booking.booking_amount,
  });
  return updated[0]!;
}

/** Admin: cancel a booking that never got confirmed — no financial impact to reverse. */
export async function cancelBooking(client: PoolClient, bookingId: string): Promise<Booking> {
  const { rows } = await client.query<Booking>(`select * from bookings where id = $1 for update`, [bookingId]);
  const booking = rows[0];
  if (!booking) throw notFound("Booking not found");
  if (booking.status !== "pending") throw conflict(`Booking is ${booking.status}, expected pending`);
  const { rows: updated } = await client.query<Booking>(
    `update bookings set status = 'cancelled', cancelled_at = now() where id = $1 returning *`,
    [bookingId],
  );
  await releaseMerchantPaymentForBooking(client, bookingId);
  return updated[0]!;
}

/** Admin: reverse a confirmed/activated booking. Every commission it
 * generated is offset with a reversal_entries row (never deleted); the
 * booking itself flips to 'reversed'. A prior activation snapshot, if any,
 * is left exactly as it was — history is never rewritten.
 * Inventory is not restored: a reversed confirmation remains a committed unit. */
export async function reverseBooking(
  client: PoolClient,
  bookingId: string,
  opts: { reason: string; adminUserId: string },
): Promise<{ booking: Booking; commissionsReversed: number }> {
  const { rows } = await client.query<Booking>(`select * from bookings where id = $1 for update`, [bookingId]);
  const booking = rows[0];
  if (!booking) throw notFound("Booking not found");
  if (booking.status !== "confirmed" && booking.status !== "activated") {
    throw conflict(`Booking is ${booking.status}, expected confirmed or activated`);
  }
  const commissionsReversed = await reverseCommissionsForBooking(client, bookingId, opts);
  await reverseMerchantPaymentForBooking(client, bookingId, opts.adminUserId);
  await reversePromotionRewardsForBooking(client, bookingId, opts.adminUserId, opts.reason);
  const { rows: updated } = await client.query<Booking>(
    `update bookings set status = 'reversed', cancelled_at = now(), cancelled_by_admin_id = $2 where id = $1 returning *`,
    [bookingId, opts.adminUserId],
  );
  return { booking: updated[0]!, commissionsReversed };
}
