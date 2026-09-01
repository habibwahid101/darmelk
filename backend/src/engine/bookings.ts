import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { postCommissionsForBooking, reverseCommissionsForBooking } from "./commissions.js";
import { requireActiveMember } from "./members.js";

export type Booking = {
  id: string;
  user_id: string;
  offer_slug: string;
  retail_value: number;
  booking_amount: number;
  qualification_benefit: number;
  status: "pending" | "confirmed" | "activated" | "cancelled" | "reversed";
  created_at: string;
  confirmed_at: string | null;
  activated_at: string | null;
  cancelled_at: string | null;
};

/** Create a booking, freezing economics from the offer row RIGHT NOW — the
 * booking's amounts never move again even if the offer's price changes later
 * (mixed offers, each keeping its own booked terms). */
export async function createBooking(client: PoolClient, userId: string, offerSlug: string): Promise<Booking> {
  await requireActiveMember(client, userId, "Annual activation approval is required before booking");
  const { rows: offerRows } = await client.query<{
    slug: string;
    retail_value: number;
    booking_amount: number;
    qualification_benefit: number;
    status: string;
  }>(`select slug, retail_value, booking_amount, qualification_benefit, status from offers where slug = $1`, [
    offerSlug,
  ]);
  const offer = offerRows[0];
  if (!offer) throw notFound("Offer not found");
  if (offer.status !== "available") throw badRequest("Offer is not currently available", "offer_unavailable");

  const id = uid("bk");
  const { rows } = await client.query<Booking>(
    `insert into bookings (id, user_id, offer_slug, retail_value, booking_amount, qualification_benefit, status)
     values ($1, $2, $3, $4, $5, $6, 'pending')
     returning *`,
    [id, userId, offer.slug, offer.retail_value, offer.booking_amount, offer.qualification_benefit],
  );
  return rows[0]!;
}

/** Admin: confirm a pending booking's payment. Posts commission ledger rows
 * to every matrix ancestor of the booker, computed from THIS booking's own
 * frozen amount. Idempotent (see commissions.ts). */
export async function confirmBooking(client: PoolClient, bookingId: string, adminUserId: string): Promise<Booking> {
  const { rows } = await client.query<Booking>(`select * from bookings where id = $1 for update`, [bookingId]);
  const booking = rows[0];
  if (!booking) throw notFound("Booking not found");
  if (booking.status !== "pending") throw conflict(`Booking is ${booking.status}, expected pending`);

  const { rows: updated } = await client.query<Booking>(
    `update bookings set status = 'confirmed', confirmed_at = now(), confirmed_by_admin_id = $2 where id = $1 returning *`,
    [bookingId, adminUserId],
  );
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
       (id, booking_id, user_id, offer_slug, offer_title, retail_value, booking_amount, qualification_benefit, activated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
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
    ],
  );
  await postCommissionsForBooking(client, {
    id: booking.id,
    userId: booking.user_id,
    bookingAmount: booking.booking_amount,
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
  return updated[0]!;
}

/** Admin: reverse a confirmed/activated booking. Every commission it
 * generated is offset with a reversal_entries row (never deleted); the
 * booking itself flips to 'reversed'. A prior activation snapshot, if any,
 * is left exactly as it was — history is never rewritten. */
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
  const { rows: updated } = await client.query<Booking>(
    `update bookings set status = 'reversed', cancelled_at = now(), cancelled_by_admin_id = $2 where id = $1 returning *`,
    [bookingId, opts.adminUserId],
  );
  return { booking: updated[0]!, commissionsReversed };
}
