import type { PoolClient } from "pg";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { recordConsents, requireCurrentConsentFor } from "./terms.js";
import { assertRailAvailable } from "./payment-settings.js";

export const BUNDLE_STATUSES = new Set(["draft", "active", "inactive"]);
export const MERCHANT_STATUSES = new Set(["pending", "active", "suspended", "inactive"]);
export const GIFT_STATUSES = new Set(["pending", "fulfilled", "cancelled"]);

export type MerchantGift = { label: string; quantity: number };

export type MerchantBundle = {
  id: string;
  name: string;
  description: string;
  purchase_amount: number;
  purchased_credit: number;
  bonus_credit: number;
  gifts: MerchantGift[];
  terms: string;
  terms_version: number;
  status: "draft" | "active" | "inactive";
  version: number;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type MerchantAccount = {
  user_id: string;
  status: "pending" | "active" | "suspended" | "inactive";
  activated_at: string | null;
  purchased_issued: number;
  bonus_issued: number;
  available: number;
  reserved: number;
  settled: number;
  created_at: string;
  updated_at: string;
  name?: string;
  email?: string;
};

export type MerchantPurchase = {
  id: string;
  user_id: string;
  bundle_id: string;
  bundle_version: number;
  bundle_name: string;
  purchase_amount: number;
  purchased_credit: number;
  bonus_credit: number;
  gifts_snapshot: MerchantGift[];
  terms_snapshot: string;
  terms_version: number;
  terms_accepted: boolean;
  terms_accepted_at: string;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  confirmed_at: string | null;
  rejected_at: string | null;
  confirmed_by_admin_id: string | null;
};

export type MerchantPaymentRequest = {
  id: string;
  purpose?: "growth_activation" | "growth_booking";
  booking_id: string | null;
  activation_id?: string | null;
  customer_user_id: string;
  merchant_user_id: string;
  amount: number;
  offer_slug: string;
  offer_title: string;
  status: "pending" | "approved" | "declined" | "cancelled" | "settled" | "reversed";
  created_at: string;
  decided_at: string | null;
  settled_at: string | null;
  reversed_at: string | null;
  customer_name?: string;
  customer_email?: string;
  merchant_name?: string;
  merchant_email?: string;
};

export type MerchantLedgerEntry = {
  id: string;
  merchant_user_id: string;
  entry_type: string;
  amount: number;
  available_delta: number;
  reserved_delta: number;
  settled_delta: number;
  purchased_issued_delta: number;
  bonus_issued_delta: number;
  bundle_purchase_id: string | null;
  payment_request_id: string | null;
  booking_id: string | null;
  actor_user_id: string | null;
  reason: string | null;
  idempotency_key: string;
  created_at: string;
};

export type MerchantGiftFulfillment = {
  id: string;
  purchase_id: string;
  merchant_user_id: string;
  gift_label: string;
  quantity: number;
  status: "pending" | "fulfilled" | "cancelled";
  created_at: string;
  updated_at: string;
  fulfilled_at: string | null;
  updated_by_admin_id: string | null;
  notes: string | null;
  bundle_name?: string;
};

function cleanText(value: unknown, label: string, max: number, required = false): string {
  if (value == null) {
    if (required) throw badRequest(`${label} is required`);
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${label} is required`);
  const text = value.trim().slice(0, max);
  if (required && !text) throw badRequest(`${label} is required`);
  return text;
}

function parsePositiveInt(value: unknown, label: string, required = true): number {
  if (value == null || value === "") {
    if (required) throw badRequest(`${label} is required`);
    return 0;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > 1_000_000_000) {
    throw badRequest(`${label} must be a positive whole number`);
  }
  return n;
}

function parseNonNegativeInt(value: unknown, label: string): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 1_000_000_000) {
    throw badRequest(`${label} must be a whole number of 0 or more`);
  }
  return n;
}

function parseGifts(value: unknown): MerchantGift[] {
  if (value == null || value === "") return [];
  let list: unknown[] = [];
  if (typeof value === "string") {
    list = value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ label, quantity: 1 }));
  } else if (Array.isArray(value)) {
    list = value;
  } else {
    throw badRequest("Gifts must be a list");
  }
  const gifts: MerchantGift[] = [];
  for (const item of list.slice(0, 12)) {
    if (typeof item === "string") {
      const label = item.trim().slice(0, 120);
      if (label) gifts.push({ label, quantity: 1 });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const rec = item as { label?: unknown; quantity?: unknown };
    const label = typeof rec.label === "string" ? rec.label.trim().slice(0, 120) : "";
    if (!label) continue;
    const quantity = rec.quantity == null || rec.quantity === "" ? 1 : Number(rec.quantity);
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
      throw badRequest("Gift quantity must be a positive whole number");
    }
    gifts.push({ label, quantity });
  }
  return gifts;
}

function asGifts(value: unknown): MerchantGift[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as { label?: unknown; quantity?: unknown };
      const label = typeof rec.label === "string" ? rec.label : "";
      const quantity = typeof rec.quantity === "number" ? rec.quantity : Number(rec.quantity ?? 1);
      if (!label) return null;
      return { label, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 };
    })
    .filter((g): g is MerchantGift => Boolean(g));
}

function normalizeBundle(row: MerchantBundle & { gifts: unknown }): MerchantBundle {
  return { ...row, gifts: asGifts(row.gifts) };
}

function normalizePurchase(row: MerchantPurchase & { gifts_snapshot: unknown }): MerchantPurchase {
  return { ...row, gifts_snapshot: asGifts(row.gifts_snapshot) };
}

async function applyLedger(
  client: PoolClient,
  opts: {
    merchantUserId: string;
    entryType: MerchantLedgerEntry["entry_type"] | string;
    amount: number;
    availableDelta: number;
    reservedDelta: number;
    settledDelta: number;
    purchasedIssuedDelta?: number;
    bonusIssuedDelta?: number;
    bundlePurchaseId?: string | null;
    paymentRequestId?: string | null;
    bookingId?: string | null;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    requireActive?: boolean;
  },
): Promise<{ applied: boolean; merchant: MerchantAccount }> {
  const inserted = await client.query<MerchantLedgerEntry>(
    `insert into merchant_credit_ledger
       (id, merchant_user_id, entry_type, amount, available_delta, reserved_delta, settled_delta,
        purchased_issued_delta, bonus_issued_delta, bundle_purchase_id, payment_request_id, booking_id,
        actor_user_id, reason, idempotency_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (idempotency_key) do nothing
     returning *`,
    [
      uid("mcl"),
      opts.merchantUserId,
      opts.entryType,
      opts.amount,
      opts.availableDelta,
      opts.reservedDelta,
      opts.settledDelta,
      opts.purchasedIssuedDelta ?? 0,
      opts.bonusIssuedDelta ?? 0,
      opts.bundlePurchaseId ?? null,
      opts.paymentRequestId ?? null,
      opts.bookingId ?? null,
      opts.actorUserId ?? null,
      opts.reason ?? null,
      opts.idempotencyKey,
    ],
  );
  if (!inserted.rows[0]) {
    const current = await client.query<MerchantAccount>(`select * from merchants where user_id = $1`, [opts.merchantUserId]);
    if (!current.rows[0]) throw notFound("Merchant not found");
    return { applied: false, merchant: current.rows[0] };
  }

  const { rows } = await client.query<MerchantAccount>(
    `update merchants set
        available = available + $2,
        reserved = reserved + $3,
        settled = settled + $4,
        purchased_issued = purchased_issued + $5,
        bonus_issued = bonus_issued + $6,
        updated_at = now()
      where user_id = $1
        and available + $2 >= 0
        and reserved + $3 >= 0
        and settled + $4 >= 0
        ${opts.requireActive ? "and status = 'active'" : ""}
      returning *`,
    [
      opts.merchantUserId,
      opts.availableDelta,
      opts.reservedDelta,
      opts.settledDelta,
      opts.purchasedIssuedDelta ?? 0,
      opts.bonusIssuedDelta ?? 0,
    ],
  );
  if (!rows[0]) {
    if (opts.requireActive) throw conflict("Insufficient Merchant Credit", "insufficient_credit");
    throw conflict("Merchant credit movement could not be applied");
  }
  return { applied: true, merchant: rows[0] };
}

export async function listPublicBundles(client: PoolClient): Promise<MerchantBundle[]> {
  const { rows } = await client.query<MerchantBundle>(
    `select * from merchant_bundles where status = 'active' order by display_order asc, created_at desc`,
  );
  return rows.map(normalizeBundle);
}

export async function listAdminBundles(client: PoolClient): Promise<MerchantBundle[]> {
  const { rows } = await client.query<MerchantBundle>(
    `select * from merchant_bundles order by display_order asc, updated_at desc`,
  );
  return rows.map(normalizeBundle);
}

export async function getBundle(client: PoolClient, id: string, opts: { includeInactive?: boolean } = {}): Promise<MerchantBundle> {
  const { rows } = await client.query<MerchantBundle>(`select * from merchant_bundles where id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound("Merchant bundle not found");
  if (!opts.includeInactive && row.status !== "active") throw notFound("Merchant bundle not found");
  return normalizeBundle(row);
}

export async function createBundle(
  client: PoolClient,
  body: Record<string, unknown>,
): Promise<MerchantBundle> {
  const name = cleanText(body.name, "Bundle name", 120, true);
  const description = cleanText(body.description ?? "", "Description", 2000);
  const purchaseAmount = parsePositiveInt(body.purchaseAmount ?? body.purchase_amount, "Purchase amount");
  const purchasedCredit = parsePositiveInt(body.purchasedCredit ?? body.purchased_credit, "Purchased credit");
  const bonusCredit = parseNonNegativeInt(body.bonusCredit ?? body.bonus_credit, "Bonus credit");
  const gifts = parseGifts(body.gifts);
  const terms = cleanText(body.terms ?? "", "Terms & Conditions", 20000, true);
  let status = cleanText(body.status ?? "draft", "Status", 32) || "draft";
  if (!BUNDLE_STATUSES.has(status)) throw badRequest("Status must be draft, active, or inactive");
  const displayOrder = parseNonNegativeInt(body.displayOrder ?? body.display_order ?? 0, "Display order");
  if (status === "active" && !terms) throw badRequest("Active bundles require Terms & Conditions");
  const { rows } = await client.query<MerchantBundle>(
    `insert into merchant_bundles
       (id, name, description, purchase_amount, purchased_credit, bonus_credit, gifts, terms, terms_version, status, display_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10)
     returning *`,
    [uid("mb"), name, description, purchaseAmount, purchasedCredit, bonusCredit, JSON.stringify(gifts), terms, status, displayOrder],
  );
  return normalizeBundle(rows[0]!);
}

export async function updateBundle(
  client: PoolClient,
  id: string,
  body: Record<string, unknown>,
): Promise<MerchantBundle> {
  const existing = await getBundle(client, id, { includeInactive: true });
  const name = cleanText(body.name ?? existing.name, "Bundle name", 120, true);
  const description = cleanText(body.description ?? existing.description, "Description", 2000);
  const purchaseAmount = parsePositiveInt(body.purchaseAmount ?? body.purchase_amount ?? existing.purchase_amount, "Purchase amount");
  const purchasedCredit = parsePositiveInt(body.purchasedCredit ?? body.purchased_credit ?? existing.purchased_credit, "Purchased credit");
  const bonusCredit = parseNonNegativeInt(body.bonusCredit ?? body.bonus_credit ?? existing.bonus_credit, "Bonus credit");
  const gifts = body.gifts === undefined ? existing.gifts : parseGifts(body.gifts);
  const terms = cleanText(body.terms ?? existing.terms, "Terms & Conditions", 20000);
  let status = cleanText(body.status ?? existing.status, "Status", 32);
  if (!BUNDLE_STATUSES.has(status)) throw badRequest("Status must be draft, active, or inactive");
  const displayOrder = parseNonNegativeInt(body.displayOrder ?? body.display_order ?? existing.display_order, "Display order");
  const economicsChanged =
    purchaseAmount !== existing.purchase_amount ||
    purchasedCredit !== existing.purchased_credit ||
    bonusCredit !== existing.bonus_credit ||
    JSON.stringify(gifts) !== JSON.stringify(existing.gifts);
  const termsChanged = terms !== existing.terms;
  if (status === "active" && !terms) throw badRequest("Active bundles require Terms & Conditions");
  const { rows } = await client.query<MerchantBundle>(
    `update merchant_bundles set
        name = $2, description = $3, purchase_amount = $4, purchased_credit = $5, bonus_credit = $6,
        gifts = $7, terms = $8, terms_version = terms_version + $9, status = $10, version = version + $11,
        display_order = $12, updated_at = now()
      where id = $1 returning *`,
    [
      id, name, description, purchaseAmount, purchasedCredit, bonusCredit, JSON.stringify(gifts), terms,
      termsChanged ? 1 : 0, status, economicsChanged || termsChanged ? 1 : 0, displayOrder,
    ],
  );
  return normalizeBundle(rows[0]!);
}

export async function setBundleStatus(client: PoolClient, id: string, status: string): Promise<MerchantBundle> {
  const next = status === "unpublish" ? "inactive" : status;
  if (!BUNDLE_STATUSES.has(next)) throw badRequest("Status must be draft, active, or inactive");
  const existing = await getBundle(client, id, { includeInactive: true });
  if (next === "active" && !existing.terms) throw badRequest("Active bundles require Terms & Conditions");
  const { rows } = await client.query<MerchantBundle>(
    `update merchant_bundles set status = $2, updated_at = now() where id = $1 returning *`,
    [id, next],
  );
  if (!rows[0]) throw notFound("Merchant bundle not found");
  return normalizeBundle(rows[0]);
}

export async function ensureMerchantRow(client: PoolClient, userId: string): Promise<MerchantAccount> {
  const existing = await client.query<MerchantAccount>(`select * from merchants where user_id = $1`, [userId]);
  if (existing.rows[0]) return existing.rows[0];
  const inserted = await client.query<MerchantAccount>(
    `insert into merchants (user_id, status) values ($1, 'pending')
     on conflict (user_id) do nothing returning *`,
    [userId],
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const again = await client.query<MerchantAccount>(`select * from merchants where user_id = $1`, [userId]);
  if (!again.rows[0]) throw new Error("merchant provisioning failed");
  return again.rows[0];
}

export async function getMerchant(client: PoolClient, userId: string): Promise<MerchantAccount | null> {
  const { rows } = await client.query<MerchantAccount>(`select * from merchants where user_id = $1`, [userId]);
  return rows[0] ?? null;
}

export async function getMerchantSummary(client: PoolClient, userId: string) {
  const merchant = await getMerchant(client, userId);
  if (!merchant) return null;
  const pending = await client.query<{ n: number }>(
    `select count(*)::int as n from merchant_payment_requests
      where merchant_user_id = $1 and status = 'pending'`,
    [userId],
  );
  return {
    status: merchant.status,
    available: merchant.available,
    reserved: merchant.reserved,
    settled: merchant.settled,
    purchasedIssued: merchant.purchased_issued,
    bonusIssued: merchant.bonus_issued,
    pendingIncomingCount: pending.rows[0]?.n ?? 0,
  };
}

export async function startBundlePurchase(
  client: PoolClient,
  userId: string,
  input: { bundleId?: unknown; termsAccepted?: unknown },
): Promise<MerchantPurchase> {
  if (input.termsAccepted !== true) throw badRequest("Terms & Conditions must be accepted", "terms_required");
  const bundleId = cleanText(input.bundleId, "Bundle", 80, true);
  const bundle = await getBundle(client, bundleId);
  await ensureMerchantRow(client, userId);
  await recordConsents(client, userId, {
    keys: ["MERCHANT_PAYMENT_TERMS"],
    context: "merchant_bundle",
    referenceId: bundle.id,
    metadata: { bundleVersion: bundle.version },
  });
  const { rows } = await client.query<MerchantPurchase>(
    `insert into merchant_bundle_purchases
       (id, user_id, bundle_id, bundle_version, bundle_name, purchase_amount, purchased_credit, bonus_credit,
        gifts_snapshot, terms_snapshot, terms_version, terms_accepted, terms_accepted_at, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,now(),'pending')
     returning *`,
    [
      uid("mbp"),
      userId,
      bundle.id,
      bundle.version,
      bundle.name,
      bundle.purchase_amount,
      bundle.purchased_credit,
      bundle.bonus_credit,
      JSON.stringify(bundle.gifts),
      bundle.terms,
      bundle.terms_version,
    ],
  );
  return normalizePurchase(rows[0]!);
}

async function issuePurchaseCredit(client: PoolClient, purchase: MerchantPurchase, adminId: string) {
  await applyLedger(client, {
    merchantUserId: purchase.user_id,
    entryType: "purchased_credit_issued",
    amount: purchase.purchased_credit,
    availableDelta: purchase.purchased_credit,
    reservedDelta: 0,
    settledDelta: 0,
    purchasedIssuedDelta: purchase.purchased_credit,
    bundlePurchaseId: purchase.id,
    actorUserId: adminId,
    reason: "Merchant bundle purchased credit",
    idempotencyKey: `purchased:${purchase.id}`,
  });
  if (purchase.bonus_credit > 0) {
    await applyLedger(client, {
      merchantUserId: purchase.user_id,
      entryType: "bonus_credit_issued",
      amount: purchase.bonus_credit,
      availableDelta: purchase.bonus_credit,
      reservedDelta: 0,
      settledDelta: 0,
      bonusIssuedDelta: purchase.bonus_credit,
      bundlePurchaseId: purchase.id,
      actorUserId: adminId,
      reason: "Merchant bundle bonus credit",
      idempotencyKey: `bonus:${purchase.id}`,
    });
  }
}

async function seedGiftFulfillments(client: PoolClient, purchase: MerchantPurchase) {
  for (const gift of purchase.gifts_snapshot) {
    await client.query(
      `insert into merchant_gift_fulfillments
         (id, purchase_id, merchant_user_id, gift_label, quantity, status)
       values ($1,$2,$3,$4,$5,'pending')`,
      [uid("mgf"), purchase.id, purchase.user_id, gift.label, gift.quantity],
    );
  }
}

export async function confirmMerchantPurchase(
  client: PoolClient,
  purchaseId: string,
  adminId: string,
): Promise<MerchantPurchase> {
  const { rows } = await client.query<MerchantPurchase>(
    `select * from merchant_bundle_purchases where id = $1 for update`,
    [purchaseId],
  );
  const purchase = rows[0];
  if (!purchase) throw notFound("Merchant bundle purchase not found");
  const normalized = normalizePurchase(purchase);
  if (normalized.status === "confirmed") return normalized;
  if (normalized.status !== "pending") throw conflict(`Purchase is ${normalized.status}`);

  await ensureMerchantRow(client, normalized.user_id);
  await client.query(`select * from merchants where user_id = $1 for update`, [normalized.user_id]);
  const { rows: updated } = await client.query<MerchantPurchase>(
    `update merchant_bundle_purchases
        set status = 'confirmed', confirmed_at = now(), confirmed_by_admin_id = $2
      where id = $1 and status = 'pending'
      returning *`,
    [purchaseId, adminId],
  );
  if (!updated[0]) return normalized;
  const confirmed = normalizePurchase(updated[0]);
  await issuePurchaseCredit(client, confirmed, adminId);
  await client.query(
    `update merchants
        set status = case when status = 'pending' then 'active' else status end,
            activated_at = coalesce(activated_at, now()),
            updated_at = now()
      where user_id = $1 and status in ('pending', 'active')`,
    [confirmed.user_id],
  );
  await seedGiftFulfillments(client, confirmed);
  return confirmed;
}

export async function rejectMerchantPurchase(
  client: PoolClient,
  purchaseId: string,
): Promise<MerchantPurchase> {
  const { rows } = await client.query<MerchantPurchase>(
    `select * from merchant_bundle_purchases where id = $1 for update`,
    [purchaseId],
  );
  const purchase = rows[0];
  if (!purchase) throw notFound("Merchant bundle purchase not found");
  if (purchase.status === "rejected") return normalizePurchase(purchase);
  if (purchase.status !== "pending") throw conflict(`Purchase is ${purchase.status}`);
  const { rows: updated } = await client.query<MerchantPurchase>(
    `update merchant_bundle_purchases set status = 'rejected', rejected_at = now()
      where id = $1 and status = 'pending' returning *`,
    [purchaseId],
  );
  return normalizePurchase(updated[0] ?? purchase);
}

export async function createMerchantPaymentRequest(
  client: PoolClient,
  customerUserId: string,
  bookingId: string,
  merchantUserIdRaw: unknown,
  input: { acceptMerchantTerms?: unknown } = {},
): Promise<MerchantPaymentRequest> {
  if (input.acceptMerchantTerms !== true) {
    throw badRequest("Merchant Payment Terms must be accepted", "terms_required");
  }
  await assertRailAvailable(client, "booking", "merchant");
  const merchantUserId = cleanText(merchantUserIdRaw, "Merchant User ID", 120, true);
  const { rows: bookingRows } = await client.query<{
    id: string;
    user_id: string;
    booking_amount: number;
    status: string;
    offer_slug: string;
    offer_title: string;
  }>(
    `select b.id, b.user_id, b.booking_amount, b.status, b.offer_slug, coalesce(o.title, b.offer_slug) as offer_title
       from bookings b join offers o on o.slug = b.offer_slug
      where b.id = $1 for update of b`,
    [bookingId],
  );
  const booking = bookingRows[0];
  if (!booking || booking.user_id !== customerUserId) throw notFound("Booking not found");
  if (booking.status !== "pending") throw conflict(`Booking is ${booking.status}`);

  const openPay = await client.query(
    `select 1 from payment_submissions
      where target_type = 'booking' and target_id = $1 and status in ('submitted', 'under_review', 'approved')`,
    [bookingId],
  );
  if (openPay.rows[0]) throw conflict("This booking already has an open payment submission");
  const openMerchant = await client.query(
    `select 1 from merchant_payment_requests
      where booking_id = $1 and status in ('pending', 'approved', 'settled')`,
    [bookingId],
  );
  if (openMerchant.rows[0]) throw conflict("A Merchant payment request is already open for this booking");

  const member = await client.query(`select 1 from members where user_id = $1`, [merchantUserId]);
  if (!member.rows[0]) throw badRequest("Merchant User ID is not valid", "merchant_not_found");

  const { rows: merchantRows } = await client.query<MerchantAccount>(
    `select * from merchants where user_id = $1 for update`,
    [merchantUserId],
  );
  const merchant = merchantRows[0];
  if (!merchant || merchant.status !== "active") {
    throw badRequest("That account is not an active Merchant", "merchant_inactive");
  }
  if (merchant.available < booking.booking_amount) {
    throw conflict("Merchant does not have sufficient available credit", "insufficient_credit");
  }

  await recordConsents(client, customerUserId, {
    keys: ["MERCHANT_PAYMENT_TERMS"],
    context: "merchant_payment",
    referenceId: booking.id,
    metadata: { bookingId: booking.id, offerSlug: booking.offer_slug, merchantUserId },
  });
  await requireCurrentConsentFor(
    client,
    customerUserId,
    "MERCHANT_PAYMENT_TERMS",
    "merchant_payment",
    booking.id,
    "Merchant Payment Terms must be accepted",
  );

  try {
    const { rows } = await client.query<MerchantPaymentRequest>(
      `insert into merchant_payment_requests
         (id, booking_id, activation_id, purpose, customer_user_id, merchant_user_id, amount, offer_slug, offer_title, status)
       values ($1,$2,null,'growth_booking',$3,$4,$5,$6,$7,'pending')
       returning *`,
      [uid("mpr"), booking.id, customerUserId, merchantUserId, booking.booking_amount, booking.offer_slug, booking.offer_title],
    );
    return rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw conflict("A Merchant payment request is already open for this booking");
    }
    throw err;
  }
}

export async function createMerchantActivationPaymentRequest(
  client: PoolClient,
  customerUserId: string,
  activationId: string,
  merchantUserIdRaw: unknown,
  input: { acceptMerchantTerms?: unknown } = {},
): Promise<MerchantPaymentRequest> {
  if (input.acceptMerchantTerms !== true) {
    throw badRequest("Merchant Payment Terms must be accepted", "terms_required");
  }
  await assertRailAvailable(client, "activation", "merchant");
  const merchantUserId = cleanText(merchantUserIdRaw, "Merchant User ID", 120, true);
  const { rows: activationRows } = await client.query<{
    id: string;
    user_id: string;
    amount: number;
    status: string;
  }>(
    `select id, user_id, amount, status from annual_activations where id = $1 for update`,
    [activationId],
  );
  const activation = activationRows[0];
  if (!activation || activation.user_id !== customerUserId) throw notFound("Activation request not found");
  if (activation.status !== "pending") throw conflict(`Activation is ${activation.status}`);

  const openPay = await client.query(
    `select 1 from payment_submissions
      where target_type = 'activation' and target_id = $1 and status in ('submitted', 'under_review', 'approved')`,
    [activationId],
  );
  if (openPay.rows[0]) throw conflict("This activation already has an open payment submission");
  const openMerchant = await client.query(
    `select 1 from merchant_payment_requests
      where activation_id = $1 and status in ('pending', 'approved', 'settled')`,
    [activationId],
  );
  if (openMerchant.rows[0]) throw conflict("A Merchant payment request is already open for this activation");

  const member = await client.query(`select 1 from members where user_id = $1`, [merchantUserId]);
  if (!member.rows[0]) throw badRequest("Merchant User ID is not valid", "merchant_not_found");

  const { rows: merchantRows } = await client.query<MerchantAccount>(
    `select * from merchants where user_id = $1 for update`,
    [merchantUserId],
  );
  const merchant = merchantRows[0];
  if (!merchant || merchant.status !== "active") {
    throw badRequest("That account is not an active Merchant", "merchant_inactive");
  }
  if (merchant.available < activation.amount) {
    throw conflict("Merchant does not have sufficient available credit", "insufficient_credit");
  }

  await recordConsents(client, customerUserId, {
    keys: ["MERCHANT_PAYMENT_TERMS"],
    context: "merchant_payment",
    referenceId: activation.id,
    metadata: { activationId: activation.id, merchantUserId },
  });
  await requireCurrentConsentFor(
    client,
    customerUserId,
    "MERCHANT_PAYMENT_TERMS",
    "merchant_payment",
    activation.id,
    "Merchant Payment Terms must be accepted",
  );

  try {
    const { rows } = await client.query<MerchantPaymentRequest>(
      `insert into merchant_payment_requests
         (id, booking_id, activation_id, purpose, customer_user_id, merchant_user_id, amount, offer_slug, offer_title, status)
       values ($1,null,$2,'growth_activation',$3,$4,$5,'growth-activation','Growth Program Activation','pending')
       returning *`,
      [uid("mpr"), activation.id, customerUserId, merchantUserId, activation.amount],
    );
    return rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw conflict("A Merchant payment request is already open for this activation");
    }
    throw err;
  }
}

export async function approveMerchantPaymentRequest(
  client: PoolClient,
  merchantUserId: string,
  requestId: string,
): Promise<MerchantPaymentRequest> {
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select * from merchant_payment_requests where id = $1 for update`,
    [requestId],
  );
  const request = rows[0];
  if (!request) throw notFound("Merchant payment request not found");
  if (request.merchant_user_id !== merchantUserId) throw forbidden("Only the intended Merchant may approve this request");
  if (request.status === "approved" || request.status === "settled") return request;
  if (request.status !== "pending") throw conflict(`Request is ${request.status}`);

  if (request.purpose === "growth_activation" || request.activation_id) {
    const { rows: activationRows } = await client.query<{ status: string }>(
      `select status from annual_activations where id = $1 for update`,
      [request.activation_id],
    );
    const activation = activationRows[0];
    if (!activation || activation.status !== "pending") throw conflict("Activation is no longer awaiting payment");

    const { rows: merchantRows } = await client.query<MerchantAccount>(
      `select * from merchants where user_id = $1 for update`,
      [merchantUserId],
    );
    const merchant = merchantRows[0];
    if (!merchant || merchant.status !== "active") throw conflict("Merchant is not active");
    if (merchant.available < request.amount) throw conflict("Insufficient Merchant Credit", "insufficient_credit");

    const { rows: updatedActivation } = await client.query<MerchantPaymentRequest>(
      `update merchant_payment_requests
          set status = 'approved', decided_at = now()
        where id = $1 and status = 'pending'
        returning *`,
      [requestId],
    );
    if (!updatedActivation[0]) throw conflict("Request is no longer pending");

    await applyLedger(client, {
      merchantUserId,
      entryType: "activation_payment_reserved",
      amount: request.amount,
      availableDelta: -request.amount,
      reservedDelta: request.amount,
      settledDelta: 0,
      paymentRequestId: request.id,
      actorUserId: merchantUserId,
      reason: "Merchant activation payment reserved",
      idempotencyKey: `reserve:${request.id}`,
      requireActive: true,
    });
    return updatedActivation[0];
  }

  const { rows: bookingRows } = await client.query<{ status: string }>(
    `select status from bookings where id = $1 for update`,
    [request.booking_id],
  );
  const booking = bookingRows[0];
  if (!booking || booking.status !== "pending") throw conflict("Booking is no longer awaiting payment");

  const { rows: merchantRows } = await client.query<MerchantAccount>(
    `select * from merchants where user_id = $1 for update`,
    [merchantUserId],
  );
  const merchant = merchantRows[0];
  if (!merchant || merchant.status !== "active") throw conflict("Merchant is not active");
  if (merchant.available < request.amount) throw conflict("Insufficient Merchant Credit", "insufficient_credit");

  const { rows: updated } = await client.query<MerchantPaymentRequest>(
    `update merchant_payment_requests
        set status = 'approved', decided_at = now()
      where id = $1 and status = 'pending'
      returning *`,
    [requestId],
  );
  if (!updated[0]) throw conflict("Request is no longer pending");

  await applyLedger(client, {
    merchantUserId,
    entryType: "booking_payment_reserved",
    amount: request.amount,
    availableDelta: -request.amount,
    reservedDelta: request.amount,
    settledDelta: 0,
    paymentRequestId: request.id,
    bookingId: request.booking_id,
    actorUserId: merchantUserId,
    reason: "Merchant payment reserved",
    idempotencyKey: `reserve:${request.id}`,
    requireActive: true,
  });
  return updated[0];
}

export async function declineMerchantPaymentRequest(
  client: PoolClient,
  merchantUserId: string,
  requestId: string,
): Promise<MerchantPaymentRequest> {
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select * from merchant_payment_requests where id = $1 for update`,
    [requestId],
  );
  const request = rows[0];
  if (!request) throw notFound("Merchant payment request not found");
  if (request.merchant_user_id !== merchantUserId) throw forbidden("Only the intended Merchant may decline this request");
  if (request.status === "declined") return request;
  if (request.status !== "pending") throw conflict(`Request is ${request.status}`);
  const { rows: updated } = await client.query<MerchantPaymentRequest>(
    `update merchant_payment_requests
        set status = 'declined', decided_at = now()
      where id = $1 and status = 'pending'
      returning *`,
    [requestId],
  );
  return updated[0] ?? request;
}

export async function settleMerchantPaymentForBooking(client: PoolClient, bookingId: string): Promise<void> {
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select * from merchant_payment_requests
      where booking_id = $1 and status in ('approved', 'settled')
      for update`,
    [bookingId],
  );
  const request = rows[0];
  if (!request) return;
  if (request.status === "settled") return;
  await client.query(`select * from merchants where user_id = $1 for update`, [request.merchant_user_id]);
  await applyLedger(client, {
    merchantUserId: request.merchant_user_id,
    entryType: "booking_payment_settled",
    amount: request.amount,
    availableDelta: 0,
    reservedDelta: -request.amount,
    settledDelta: request.amount,
    paymentRequestId: request.id,
    bookingId: request.booking_id,
    reason: "Merchant payment settled",
    idempotencyKey: `settle:${request.id}`,
  });
  await client.query(
    `update merchant_payment_requests set status = 'settled', settled_at = now()
      where id = $1 and status = 'approved'`,
    [request.id],
  );
}

export async function releaseMerchantPaymentForBooking(client: PoolClient, bookingId: string): Promise<void> {
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select * from merchant_payment_requests
      where booking_id = $1 and status in ('pending', 'approved')
      for update`,
    [bookingId],
  );
  const request = rows[0];
  if (!request) return;
  if (request.status === "approved") {
    await client.query(`select * from merchants where user_id = $1 for update`, [request.merchant_user_id]);
    await applyLedger(client, {
      merchantUserId: request.merchant_user_id,
      entryType: "reservation_released",
      amount: request.amount,
      availableDelta: request.amount,
      reservedDelta: -request.amount,
      settledDelta: 0,
      paymentRequestId: request.id,
      bookingId: request.booking_id,
      reason: "Reserved Merchant Credit released",
      idempotencyKey: `release:${request.id}`,
    });
  }
  await client.query(
    `update merchant_payment_requests
        set status = 'cancelled', decided_at = coalesce(decided_at, now())
      where id = $1 and status in ('pending', 'approved')`,
    [request.id],
  );
}

export async function reverseMerchantPaymentForBooking(
  client: PoolClient,
  bookingId: string,
  adminId: string,
): Promise<void> {
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select * from merchant_payment_requests
      where booking_id = $1 and status in ('approved', 'settled', 'reversed')
      for update`,
    [bookingId],
  );
  const request = rows[0];
  if (!request) return;
  if (request.status === "reversed") return;
  await client.query(`select * from merchants where user_id = $1 for update`, [request.merchant_user_id]);
  if (request.status === "settled") {
    await applyLedger(client, {
      merchantUserId: request.merchant_user_id,
      entryType: "reversal",
      amount: request.amount,
      availableDelta: request.amount,
      reservedDelta: 0,
      settledDelta: -request.amount,
      paymentRequestId: request.id,
      bookingId: request.booking_id,
      actorUserId: adminId,
      reason: "Merchant payment reversed",
      idempotencyKey: `reverse:${request.id}`,
    });
  } else if (request.status === "approved") {
    await releaseMerchantPaymentForBooking(client, bookingId);
    return;
  }
  await client.query(
    `update merchant_payment_requests set status = 'reversed', reversed_at = now()
      where id = $1 and status = 'settled'`,
    [request.id],
  );
}

export async function settleMerchantPaymentForActivation(client: PoolClient, activationId: string): Promise<void> {
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select * from merchant_payment_requests
      where activation_id = $1 and status in ('approved', 'settled')
      for update`,
    [activationId],
  );
  const request = rows[0];
  if (!request) return;
  if (request.status === "settled") return;
  await client.query(`select * from merchants where user_id = $1 for update`, [request.merchant_user_id]);
  await applyLedger(client, {
    merchantUserId: request.merchant_user_id,
    entryType: "activation_payment_settled",
    amount: request.amount,
    availableDelta: 0,
    reservedDelta: -request.amount,
    settledDelta: request.amount,
    paymentRequestId: request.id,
    reason: "Merchant activation payment settled",
    idempotencyKey: `settle:${request.id}`,
  });
  await client.query(
    `update merchant_payment_requests set status = 'settled', settled_at = now()
      where id = $1 and status = 'approved'`,
    [request.id],
  );
}

export async function releaseMerchantPaymentForActivation(client: PoolClient, activationId: string): Promise<void> {
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select * from merchant_payment_requests
      where activation_id = $1 and status in ('pending', 'approved')
      for update`,
    [activationId],
  );
  const request = rows[0];
  if (!request) return;
  if (request.status === "approved") {
    await client.query(`select * from merchants where user_id = $1 for update`, [request.merchant_user_id]);
    await applyLedger(client, {
      merchantUserId: request.merchant_user_id,
      entryType: "reservation_released",
      amount: request.amount,
      availableDelta: request.amount,
      reservedDelta: -request.amount,
      settledDelta: 0,
      paymentRequestId: request.id,
      reason: "Reserved Merchant Credit released",
      idempotencyKey: `release:${request.id}`,
    });
  }
  await client.query(
    `update merchant_payment_requests
        set status = 'cancelled', decided_at = coalesce(decided_at, now())
      where id = $1 and status in ('pending', 'approved')`,
    [request.id],
  );
}

export async function activationHasApprovedMerchantPayment(client: PoolClient, activationId: string): Promise<boolean> {
  const { rows } = await client.query(
    `select 1 from merchant_payment_requests where activation_id = $1 and status in ('approved', 'settled')`,
    [activationId],
  );
  return Boolean(rows[0]);
}

export async function setMerchantStatus(
  client: PoolClient,
  userId: string,
  status: string,
): Promise<MerchantAccount> {
  if (!MERCHANT_STATUSES.has(status) || status === "pending") {
    throw badRequest("Status must be active, suspended, or inactive");
  }
  const { rows } = await client.query<MerchantAccount>(
    `update merchants set status = $2, updated_at = now() where user_id = $1 returning *`,
    [userId, status],
  );
  if (!rows[0]) throw notFound("Merchant not found");
  return rows[0];
}

export async function adjustMerchantCredit(
  client: PoolClient,
  userId: string,
  input: { amount?: unknown; direction?: unknown; reason?: unknown },
  adminId: string,
): Promise<MerchantAccount> {
  const amount = parsePositiveInt(input.amount, "Amount");
  const direction = cleanText(input.direction, "Direction", 16, true);
  if (direction !== "credit" && direction !== "debit") throw badRequest("Direction must be credit or debit");
  const reason = cleanText(input.reason, "Reason", 500, true);
  const merchant = await client.query<MerchantAccount>(`select * from merchants where user_id = $1 for update`, [userId]);
  if (!merchant.rows[0]) throw notFound("Merchant not found");
  const delta = direction === "credit" ? amount : -amount;
  if (direction === "debit" && merchant.rows[0].available < amount) {
    throw conflict("Insufficient available Merchant Credit for this adjustment");
  }
  const result = await applyLedger(client, {
    merchantUserId: userId,
    entryType: "admin_adjustment",
    amount,
    availableDelta: delta,
    reservedDelta: 0,
    settledDelta: 0,
    actorUserId: adminId,
    reason,
    idempotencyKey: `adj:${uid("k")}`,
  });
  return result.merchant;
}

export async function listMerchantDashboard(client: PoolClient, userId: string) {
  const merchant = await getMerchant(client, userId);
  const bundles = await listPublicBundles(client);
  const purchases = await client.query<MerchantPurchase>(
    `select * from merchant_bundle_purchases where user_id = $1 order by created_at desc`,
    [userId],
  );
  const incoming = merchant
    ? await client.query<MerchantPaymentRequest>(
        `select r.*, u.name as customer_name, u.email as customer_email
           from merchant_payment_requests r join "user" u on u.id = r.customer_user_id
          where r.merchant_user_id = $1
          order by r.created_at desc
          limit 50`,
        [userId],
      )
    : { rows: [] as MerchantPaymentRequest[] };
  const outgoing = await client.query<MerchantPaymentRequest>(
    `select r.*, mu.name as merchant_name, mu.email as merchant_email
       from merchant_payment_requests r join "user" mu on mu.id = r.merchant_user_id
      where r.customer_user_id = $1
      order by r.created_at desc
      limit 50`,
    [userId],
  );
  const ledger = merchant
    ? await client.query<MerchantLedgerEntry>(
        `select * from merchant_credit_ledger where merchant_user_id = $1 order by created_at desc limit 80`,
        [userId],
      )
    : { rows: [] as MerchantLedgerEntry[] };
  const gifts = merchant
    ? await client.query<MerchantGiftFulfillment>(
        `select g.*, p.bundle_name
           from merchant_gift_fulfillments g
           join merchant_bundle_purchases p on p.id = g.purchase_id
          where g.merchant_user_id = $1
          order by g.created_at desc`,
        [userId],
      )
    : { rows: [] as MerchantGiftFulfillment[] };
  return {
    merchant,
    bundles,
    purchases: purchases.rows.map(normalizePurchase),
    incomingRequests: incoming.rows,
    outgoingRequests: outgoing.rows,
    ledger: ledger.rows,
    gifts: gifts.rows,
  };
}

export async function listMerchants(client: PoolClient): Promise<MerchantAccount[]> {
  const { rows } = await client.query<MerchantAccount>(
    `select m.*, u.name, u.email
       from merchants m join "user" u on u.id = m.user_id
      order by m.updated_at desc`,
  );
  return rows;
}

export async function getMerchantAdminDetail(client: PoolClient, userId: string) {
  const { rows } = await client.query<MerchantAccount>(
    `select m.*, u.name, u.email
       from merchants m join "user" u on u.id = m.user_id
      where m.user_id = $1`,
    [userId],
  );
  if (!rows[0]) throw notFound("Merchant not found");
  const dashboard = await listMerchantDashboard(client, userId);
  return { ...dashboard, merchant: rows[0] };
}

export async function listAdminRequests(client: PoolClient, status?: string) {
  const params: unknown[] = [];
  const where = status
    ? (params.push(status), `where r.status = $1`)
    : "";
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select r.*, cu.name as customer_name, cu.email as customer_email,
            mu.name as merchant_name, mu.email as merchant_email
       from merchant_payment_requests r
       join "user" cu on cu.id = r.customer_user_id
       join "user" mu on mu.id = r.merchant_user_id
      ${where}
      order by r.created_at desc
      limit 200`,
    params,
  );
  return rows;
}

export async function listAdminLedger(
  client: PoolClient,
  opts: { userId?: string; entryType?: string } = {},
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.userId) {
    params.push(opts.userId);
    clauses.push(`l.merchant_user_id = $${params.length}`);
  }
  if (opts.entryType) {
    params.push(opts.entryType);
    clauses.push(`l.entry_type = $${params.length}`);
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const { rows } = await client.query<MerchantLedgerEntry & { merchant_name?: string; merchant_email?: string }>(
    `select l.*, u.name as merchant_name, u.email as merchant_email
       from merchant_credit_ledger l join "user" u on u.id = l.merchant_user_id
      ${where}
      order by l.created_at desc
      limit 300`,
    params,
  );
  return rows;
}

export async function listAdminGifts(client: PoolClient, status?: string) {
  const params: unknown[] = [];
  const where = status ? (params.push(status), `where g.status = $1`) : "";
  const { rows } = await client.query<MerchantGiftFulfillment & { merchant_name?: string; bundle_name?: string }>(
    `select g.*, u.name as merchant_name, p.bundle_name
       from merchant_gift_fulfillments g
       join "user" u on u.id = g.merchant_user_id
       join merchant_bundle_purchases p on p.id = g.purchase_id
      ${where}
      order by g.created_at desc
      limit 200`,
    params,
  );
  return rows;
}

export async function updateGiftFulfillment(
  client: PoolClient,
  id: string,
  input: { status?: unknown; notes?: unknown },
  adminId: string,
): Promise<MerchantGiftFulfillment> {
  const status = cleanText(input.status, "Status", 32, true);
  if (!GIFT_STATUSES.has(status)) throw badRequest("Status must be pending, fulfilled, or cancelled");
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 500) : null;
  const { rows } = await client.query<MerchantGiftFulfillment>(
    `update merchant_gift_fulfillments
        set status = $2,
            notes = coalesce($3, notes),
            updated_at = now(),
            updated_by_admin_id = $4,
            fulfilled_at = case when $2 = 'fulfilled' then coalesce(fulfilled_at, now()) else fulfilled_at end
      where id = $1
      returning *`,
    [id, status, notes, adminId],
  );
  if (!rows[0]) throw notFound("Gift record not found");
  return rows[0];
}

export async function getMerchantOverview(client: PoolClient) {
  const counts = await client.query<{
    active_merchants: number;
    pending_purchases: number;
    pending_requests: number;
    purchased_issued: number;
    bonus_issued: number;
    available: number;
    reserved: number;
    settled: number;
  }>(
    `select
       (select count(*)::int from merchants where status = 'active') as active_merchants,
       (select count(*)::int from merchant_bundle_purchases where status = 'pending') as pending_purchases,
       (select count(*)::int from merchant_payment_requests where status = 'pending') as pending_requests,
       (select coalesce(sum(purchased_issued),0)::int from merchants) as purchased_issued,
       (select coalesce(sum(bonus_issued),0)::int from merchants) as bonus_issued,
       (select coalesce(sum(available),0)::int from merchants) as available,
       (select coalesce(sum(reserved),0)::int from merchants) as reserved,
       (select coalesce(sum(settled),0)::int from merchants) as settled`,
  );
  const recent = await client.query(
    `select id, merchant_user_id, entry_type, amount, created_at
       from merchant_credit_ledger order by created_at desc limit 8`,
  );
  return { ...counts.rows[0]!, recent: recent.rows };
}

export async function getBookingMerchantRequest(client: PoolClient, bookingId: string) {
  const { rows } = await client.query<MerchantPaymentRequest>(
    `select * from merchant_payment_requests where booking_id = $1 order by created_at desc limit 1`,
    [bookingId],
  );
  return rows[0] ?? null;
}

export async function bookingHasApprovedMerchantPayment(client: PoolClient, bookingId: string): Promise<boolean> {
  const { rows } = await client.query(
    `select 1 from merchant_payment_requests where booking_id = $1 and status in ('approved', 'settled')`,
    [bookingId],
  );
  return Boolean(rows[0]);
}
