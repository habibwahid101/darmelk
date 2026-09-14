import type { PoolClient } from "pg";
import { badRequest, conflict } from "../errors.js";
import { uid } from "../ids.js";

/** Shared inventory for General Marketplace and Growth Program.
 * Reserved quantity is deferred: pending bookings and Request to Book
 * do not hold stock. Confirmed units consume exactly once. Reverse does
 * not restore — a reversed booking remains a committed unit. */
export type Inventory = {
  total: number | null;
  reserved: number | null;
  sold: number;
  available: number | null;
};

export function deriveInventory(total: number | null | undefined, sold: number): Inventory {
  const qty = total == null ? null : Number(total);
  return {
    total: qty,
    reserved: null,
    sold,
    available: qty == null ? null : Math.max(0, qty - sold),
  };
}

export async function soldByOffer(client: PoolClient, slugs: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!slugs.length) return counts;
  const { rows } = await client.query<{ offer_slug: string; sold: number }>(
    `select offer_slug, count(*)::int as sold
       from offer_inventory_events
      where event_type = 'consume' and offer_slug = any($1::text[])
      group by offer_slug`,
    [slugs],
  );
  for (const row of rows) counts.set(row.offer_slug, row.sold);
  return counts;
}

export async function soldForOffer(client: PoolClient, slug: string): Promise<number> {
  const counts = await soldByOffer(client, [slug]);
  return counts.get(slug) ?? 0;
}

export async function inventoryForOffer(
  client: PoolClient,
  slug: string,
  totalQuantity: number | null | undefined,
): Promise<Inventory> {
  return deriveInventory(totalQuantity, await soldForOffer(client, slug));
}

export async function assertTotalQuantityAllowed(
  client: PoolClient,
  slug: string,
  totalQuantity: number | null,
): Promise<void> {
  if (totalQuantity == null) return;
  const sold = await soldForOffer(client, slug);
  if (totalQuantity < sold) {
    throw badRequest(
      `Total quantity cannot be below committed sold quantity (${sold})`,
      "quantity_below_sold",
    );
  }
}

/** Consume one unit for a binding confirmation. Idempotent on booking_id.
 * Locks the offer row so two last-unit confirms cannot oversell. */
export async function consumeInventoryForConfirmation(
  client: PoolClient,
  opts: { offerSlug: string; bookingId: string },
): Promise<void> {
  const { rows } = await client.query<{ slug: string; total_quantity: number | null }>(
    `select slug, total_quantity from offers where slug = $1 for update`,
    [opts.offerSlug],
  );
  const offer = rows[0];
  if (!offer) throw conflict("Offer not found");

  const already = await client.query(
    `select 1 from offer_inventory_events where booking_id = $1 and event_type = 'consume'`,
    [opts.bookingId],
  );
  if (already.rows[0]) return;

  const sold = await soldForOffer(client, opts.offerSlug);
  if (offer.total_quantity != null && sold >= offer.total_quantity) {
    throw conflict("No remaining quantity for this property", "offer_sold_out");
  }

  try {
    await client.query(
      `insert into offer_inventory_events (id, offer_slug, booking_id, event_type, quantity)
       values ($1, $2, $3, 'consume', 1)`,
      [uid("inv"), opts.offerSlug, opts.bookingId],
    );
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return;
    }
    throw err;
  }
}
