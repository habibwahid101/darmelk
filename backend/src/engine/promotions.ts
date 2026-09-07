import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { logAdminAction } from "./members.js";

export const STORED_STATUSES = new Set(["draft", "published", "closed"]);
export const FULFILLMENT_STATUSES = new Set(["eligible", "approved", "fulfilled", "cancelled", "reversed"]);

export type PromotionReward = {
  id?: string;
  name: string;
  description: string;
  quantity: number;
  value_amount: number | null;
  instructions: string | null;
  display_order: number;
};

export type PromotionOfferRef = { slug: string; title: string };

export type PromotionLifecycle = "draft" | "upcoming" | "active" | "expired" | "closed";

export type Promotion = {
  id: string;
  title: string;
  short_description: string;
  description: string;
  start_at: string;
  end_at: string;
  offer_scope: "all" | "selected";
  terms: string;
  terms_version: number;
  version: number;
  has_banner: boolean;
  status: "draft" | "published" | "closed";
  lifecycle: PromotionLifecycle;
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by_admin_id: string | null;
  published_at: string | null;
  published_by_admin_id: string | null;
  closed_at: string | null;
  closed_by_admin_id: string | null;
  offers: PromotionOfferRef[];
  rewards: PromotionReward[];
};

export type PromotionQualification = {
  id: string;
  promotion_id: string;
  user_id: string;
  booking_id: string;
  offer_slug: string;
  offer_title: string;
  booking_confirmed_at: string;
  qualified_at: string;
  promotion_title: string;
  promotion_version: number;
  terms_snapshot: string;
  terms_version: number;
  rewards_snapshot: PromotionReward[];
  start_at: string;
  end_at: string;
  user_name?: string;
  user_email?: string;
  fulfillments?: PromotionFulfillment[];
};

export type PromotionFulfillment = {
  id: string;
  qualification_id: string;
  promotion_id: string;
  user_id: string;
  reward_name: string;
  reward_description: string;
  quantity: number;
  value_amount: number | null;
  instructions: string | null;
  display_order: number;
  status: "eligible" | "approved" | "fulfilled" | "cancelled" | "reversed";
  created_at: string;
  updated_at: string;
  updated_by_admin_id: string | null;
  notes: string | null;
  events?: PromotionRewardEvent[];
};

export type PromotionRewardEvent = {
  id: string;
  fulfillment_id: string;
  qualification_id: string;
  actor_user_id: string | null;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  created_at: string;
};

const PROMO_COLS = `
  id, title, short_description, description, start_at, end_at, offer_scope, terms, terms_version,
  version, status, display_order, created_at, updated_at, created_by_admin_id, published_at,
  published_by_admin_id, closed_at, closed_by_admin_id,
  (banner_data is not null) as has_banner
`;

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

function parseNonNegativeInt(value: unknown, label: string): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 1_000_000_000) {
    throw badRequest(`${label} must be a whole number of 0 or more`);
  }
  return n;
}

function parsePositiveInt(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > 99) {
    throw badRequest(`${label} must be a positive whole number`);
  }
  return n;
}

function parseTime(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) throw badRequest(`${label} is required`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${label} is not a valid date`);
  return d;
}

function asRewards(value: unknown): PromotionReward[] {
  if (!Array.isArray(value)) return [];
  const rewards: PromotionReward[] = [];
  for (const [i, item] of value.entries()) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    if (!name) continue;
    const quantity = typeof rec.quantity === "number" ? rec.quantity : Number(rec.quantity ?? 1);
    rewards.push({
      id: typeof rec.id === "string" ? rec.id : undefined,
      name,
      description: typeof rec.description === "string" ? rec.description : "",
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      value_amount: rec.value_amount == null || rec.value_amount === "" ? null : Number(rec.value_amount),
      instructions: typeof rec.instructions === "string" ? rec.instructions : null,
      display_order: typeof rec.display_order === "number" ? rec.display_order : i,
    });
  }
  return rewards;
}

function parseRewards(value: unknown): PromotionReward[] {
  if (!Array.isArray(value) || value.length === 0) throw badRequest("At least one reward item is required", "rewards_required");
  const rewards: PromotionReward[] = [];
  for (const [i, item] of value.slice(0, 12).entries()) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = cleanText(rec.name, "Reward name", 120, true);
    const description = cleanText(rec.description ?? "", "Reward description", 2000);
    const quantity = rec.quantity == null || rec.quantity === "" ? 1 : parsePositiveInt(rec.quantity, "Reward quantity");
    const valueAmount =
      rec.valueAmount == null && rec.value_amount == null
        ? null
        : parseNonNegativeInt(rec.valueAmount ?? rec.value_amount, "Reward value");
    const instructions = cleanText(rec.instructions ?? "", "Instructions", 2000) || null;
    rewards.push({
      name,
      description,
      quantity,
      value_amount: valueAmount,
      instructions,
      display_order: i,
    });
  }
  if (!rewards.length) throw badRequest("At least one reward item is required", "rewards_required");
  return rewards;
}

async function parseOfferSlugs(client: PoolClient, scope: string, slugsRaw: unknown): Promise<string[]> {
  if (scope === "all") return [];
  const slugs = Array.isArray(slugsRaw)
    ? slugsRaw.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
    : [];
  if (!slugs.length) throw badRequest("Select at least one eligible offer", "offers_required");
  const unique = [...new Set(slugs)].slice(0, 50);
  const { rows } = await client.query<{ slug: string }>(`select slug from offers where slug = any($1)`, [unique]);
  if (rows.length !== unique.length) throw badRequest("One or more selected offers do not exist");
  return unique;
}

export function lifecycleOf(
  row: { status: string; start_at: string | Date; end_at: string | Date },
  now = new Date(),
): PromotionLifecycle {
  if (row.status === "draft") return "draft";
  if (row.status === "closed") return "closed";
  const start = new Date(row.start_at).getTime();
  const end = new Date(row.end_at).getTime();
  const t = now.getTime();
  if (t < start) return "upcoming";
  if (t >= end) return "expired";
  return "active";
}

function withLifecycle<T extends { status: string; start_at: string; end_at: string }>(row: T, now?: Date): T & { lifecycle: PromotionLifecycle } {
  return { ...row, lifecycle: lifecycleOf(row, now) };
}

async function loadOffers(client: PoolClient, promotionId: string): Promise<PromotionOfferRef[]> {
  const { rows } = await client.query<PromotionOfferRef>(
    `select o.slug, o.title
       from promotion_offers po join offers o on o.slug = po.offer_slug
      where po.promotion_id = $1
      order by o.title`,
    [promotionId],
  );
  return rows;
}

async function loadRewards(client: PoolClient, promotionId: string): Promise<PromotionReward[]> {
  const { rows } = await client.query<PromotionReward>(
    `select id, name, description, quantity, value_amount, instructions, display_order
       from promotion_rewards where promotion_id = $1 order by display_order asc, name asc`,
    [promotionId],
  );
  return rows;
}

async function hydrate(client: PoolClient, row: Omit<Promotion, "offers" | "rewards" | "lifecycle">, now?: Date): Promise<Promotion> {
  const [offers, rewards] = await Promise.all([loadOffers(client, row.id), loadRewards(client, row.id)]);
  return withLifecycle({ ...row, offers, rewards } as Promotion, now);
}

export async function listAdminPromotions(client: PoolClient): Promise<Promotion[]> {
  const { rows } = await client.query<Omit<Promotion, "offers" | "rewards" | "lifecycle">>(
    `select ${PROMO_COLS} from promotions order by display_order asc, updated_at desc`,
  );
  const now = new Date();
  return Promise.all(rows.map((row) => hydrate(client, row, now)));
}

export async function listPublicPromotions(client: PoolClient): Promise<Promotion[]> {
  const { rows } = await client.query<Omit<Promotion, "offers" | "rewards" | "lifecycle">>(
    `select ${PROMO_COLS} from promotions
      where status = 'published' and end_at > now()
      order by display_order asc, end_at asc`,
  );
  const now = new Date();
  return Promise.all(rows.map((row) => hydrate(client, row, now)));
}

export async function listDashboardPromotions(client: PoolClient, userId: string) {
  const promotions = (await listPublicPromotions(client)).filter((p) => p.lifecycle === "active");
  const { rows: mine } = await client.query<PromotionQualification>(
    `select * from promotion_qualifications where user_id = $1 order by qualified_at desc`,
    [userId],
  );
  return {
    serverNow: new Date().toISOString(),
    primary: promotions[0] ?? null,
    more: promotions.slice(1),
    qualifications: mine.map((q) => ({ ...q, rewards_snapshot: asRewards(q.rewards_snapshot) })),
  };
}

export async function getPromotion(
  client: PoolClient,
  id: string,
  opts: { includeDraft?: boolean } = {},
): Promise<Promotion> {
  const { rows } = await client.query<Omit<Promotion, "offers" | "rewards" | "lifecycle">>(
    `select ${PROMO_COLS} from promotions where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound("Promotion not found");
  if (!opts.includeDraft && row.status === "draft") throw notFound("Promotion not found");
  return hydrate(client, row);
}

export async function getPromotionBanner(
  client: PoolClient,
  id: string,
  opts: { includeDraft?: boolean } = {},
): Promise<{ bytes: Buffer; mime: string; filename: string }> {
  const { rows } = await client.query<{ banner_data: Buffer; banner_mime: string; banner_filename: string; status: string }>(
    `select banner_data, banner_mime, banner_filename, status from promotions where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row?.banner_data) throw notFound("Promotion image not found");
  if (!opts.includeDraft && row.status === "draft") throw notFound("Promotion image not found");
  return {
    bytes: row.banner_data,
    mime: row.banner_mime || "image/jpeg",
    filename: row.banner_filename || "banner.jpg",
  };
}

async function replaceOffers(client: PoolClient, promotionId: string, slugs: string[]) {
  await client.query(`delete from promotion_offers where promotion_id = $1`, [promotionId]);
  for (const slug of slugs) {
    await client.query(`insert into promotion_offers (promotion_id, offer_slug) values ($1,$2)`, [promotionId, slug]);
  }
}

async function replaceRewards(client: PoolClient, promotionId: string, rewards: PromotionReward[]) {
  await client.query(`delete from promotion_rewards where promotion_id = $1`, [promotionId]);
  for (const reward of rewards) {
    await client.query(
      `insert into promotion_rewards
         (id, promotion_id, name, description, quantity, value_amount, instructions, display_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        uid("prw"),
        promotionId,
        reward.name,
        reward.description,
        reward.quantity,
        reward.value_amount,
        reward.instructions,
        reward.display_order,
      ],
    );
  }
}

export async function createPromotion(
  client: PoolClient,
  body: Record<string, unknown>,
  adminId: string,
): Promise<Promotion> {
  const title = cleanText(body.title, "Promotion title", 160, true);
  const shortDescription = cleanText(body.shortDescription ?? body.short_description ?? "", "Short description", 280);
  const description = cleanText(body.description ?? "", "Description", 20000);
  const start = parseTime(body.startAt ?? body.start_at, "Start date");
  const end = parseTime(body.endAt ?? body.end_at, "End date");
  if (end.getTime() <= start.getTime()) throw badRequest("End must be after start", "invalid_window");
  const offerScope = cleanText(body.offerScope ?? body.offer_scope ?? "selected", "Offer scope", 16);
  if (offerScope !== "all" && offerScope !== "selected") throw badRequest("Offer scope must be all or selected");
  const slugs = await parseOfferSlugs(client, offerScope, body.offerSlugs ?? body.offer_slugs);
  const rewards = parseRewards(body.rewards);
  const terms = cleanText(body.terms ?? "", "Terms & Conditions", 20000);
  const displayOrder = parseNonNegativeInt(body.displayOrder ?? body.display_order ?? 0, "Display order");
  let status = cleanText(body.status ?? "draft", "Status", 16) || "draft";
  if (!STORED_STATUSES.has(status) || status === "closed") status = "draft";
  if (status === "published") {
    if (!title || !rewards.length) throw badRequest("Published promotions need a title and at least one reward");
    if (offerScope === "selected" && !slugs.length) throw badRequest("Published promotions need at least one eligible offer");
  }
  const id = uid("prm");
  const { rows } = await client.query<Omit<Promotion, "offers" | "rewards" | "lifecycle">>(
    `insert into promotions
       (id, title, short_description, description, start_at, end_at, offer_scope, terms, status, display_order,
        created_by_admin_id, published_at, published_by_admin_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning ${PROMO_COLS}`,
    [
      id,
      title,
      shortDescription,
      description,
      start.toISOString(),
      end.toISOString(),
      offerScope,
      terms,
      status,
      displayOrder,
      adminId,
      status === "published" ? new Date().toISOString() : null,
      status === "published" ? adminId : null,
    ],
  );
  await replaceOffers(client, id, slugs);
  await replaceRewards(client, id, rewards);
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: "promotion.create",
    targetType: "promotion",
    targetId: id,
    payload: { status },
  });
  return hydrate(client, rows[0]!);
}

export async function updatePromotion(
  client: PoolClient,
  id: string,
  body: Record<string, unknown>,
  adminId: string,
): Promise<Promotion> {
  const existing = await getPromotion(client, id, { includeDraft: true });
  if (existing.status === "closed") throw conflict("Closed promotions cannot be edited");
  const title = cleanText(body.title ?? existing.title, "Promotion title", 160, true);
  const shortDescription = cleanText(
    body.shortDescription ?? body.short_description ?? existing.short_description,
    "Short description",
    280,
  );
  const description = cleanText(body.description ?? existing.description, "Description", 20000);
  const start = parseTime(body.startAt ?? body.start_at ?? existing.start_at, "Start date");
  const end = parseTime(body.endAt ?? body.end_at ?? existing.end_at, "End date");
  if (end.getTime() <= start.getTime()) throw badRequest("End must be after start", "invalid_window");
  const offerScope = cleanText(body.offerScope ?? body.offer_scope ?? existing.offer_scope, "Offer scope", 16);
  if (offerScope !== "all" && offerScope !== "selected") throw badRequest("Offer scope must be all or selected");
  const slugs =
    body.offerSlugs !== undefined || body.offer_slugs !== undefined
      ? await parseOfferSlugs(client, offerScope, body.offerSlugs ?? body.offer_slugs)
      : existing.offers.map((o) => o.slug);
  if (offerScope === "selected" && !slugs.length) throw badRequest("Select at least one eligible offer", "offers_required");
  const rewards = body.rewards === undefined ? existing.rewards : parseRewards(body.rewards);
  const terms = cleanText(body.terms ?? existing.terms, "Terms & Conditions", 20000);
  const displayOrder = parseNonNegativeInt(body.displayOrder ?? body.display_order ?? existing.display_order, "Display order");
  const termsChanged = terms !== existing.terms;
  const economicsChanged =
    JSON.stringify(rewards.map((r) => ({ n: r.name, q: r.quantity, d: r.description }))) !==
      JSON.stringify(existing.rewards.map((r) => ({ n: r.name, q: r.quantity, d: r.description }))) ||
    JSON.stringify(slugs) !== JSON.stringify(existing.offers.map((o) => o.slug)) ||
    offerScope !== existing.offer_scope ||
    start.toISOString() !== new Date(existing.start_at).toISOString() ||
    end.toISOString() !== new Date(existing.end_at).toISOString();
  const { rows } = await client.query<Omit<Promotion, "offers" | "rewards" | "lifecycle">>(
    `update promotions set
        title = $2, short_description = $3, description = $4, start_at = $5, end_at = $6,
        offer_scope = $7, terms = $8, terms_version = terms_version + $9, version = version + $10,
        display_order = $11, updated_at = now()
      where id = $1 returning ${PROMO_COLS}`,
    [
      id,
      title,
      shortDescription,
      description,
      start.toISOString(),
      end.toISOString(),
      offerScope,
      terms,
      termsChanged ? 1 : 0,
      termsChanged || economicsChanged ? 1 : 0,
      displayOrder,
    ],
  );
  await replaceOffers(client, id, offerScope === "all" ? [] : slugs);
  await replaceRewards(client, id, rewards);
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: "promotion.update",
    targetType: "promotion",
    targetId: id,
    payload: { version: rows[0]?.version },
  });
  return hydrate(client, rows[0]!);
}

export async function setPromotionStatus(
  client: PoolClient,
  id: string,
  status: string,
  adminId: string,
): Promise<Promotion> {
  const existing = await getPromotion(client, id, { includeDraft: true });
  const next = status === "unpublish" ? "draft" : status === "activate" || status === "publish" ? "published" : status;
  if (!STORED_STATUSES.has(next)) throw badRequest("Status must be draft, published, or closed");
  if (existing.status === "closed" && next !== "closed") throw conflict("Closed promotions cannot be reopened");
  if (next === "published") {
    if (!existing.title) throw badRequest("Published promotions need a title");
    if (!existing.rewards.length) throw badRequest("Published promotions need at least one reward");
    if (existing.offer_scope === "selected" && !existing.offers.length) {
      throw badRequest("Published promotions need at least one eligible offer");
    }
    if (new Date(existing.end_at).getTime() <= Date.now()) {
      throw badRequest("Cannot publish a promotion whose end time has already passed");
    }
  }
  const { rows } = await client.query<Omit<Promotion, "offers" | "rewards" | "lifecycle">>(
    `update promotions set
        status = $2,
        published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end,
        published_by_admin_id = case when $2 = 'published' then coalesce(published_by_admin_id, $3) else published_by_admin_id end,
        closed_at = case when $2 = 'closed' then coalesce(closed_at, now()) else closed_at end,
        closed_by_admin_id = case when $2 = 'closed' then coalesce(closed_by_admin_id, $3) else closed_by_admin_id end,
        updated_at = now()
      where id = $1 returning ${PROMO_COLS}`,
    [id, next, adminId],
  );
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: next === "published" ? "promotion.publish" : next === "closed" ? "promotion.close" : "promotion.status",
    targetType: "promotion",
    targetId: id,
    payload: { status: next },
  });
  return hydrate(client, rows[0]!);
}

const BANNER_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export async function setPromotionBanner(
  client: PoolClient,
  id: string,
  input: { filename?: unknown; mime?: unknown; bytesBase64?: unknown },
  adminId: string,
): Promise<Promotion> {
  await getPromotion(client, id, { includeDraft: true });
  const filename = cleanText(input.filename ?? "banner.jpg", "Filename", 180, true);
  const mime = cleanText(input.mime ?? "", "Image type", 80, true).toLowerCase();
  if (!BANNER_MIME.has(mime)) throw badRequest("Image must be JPG, PNG, or WebP");
  if (typeof input.bytesBase64 !== "string" || !input.bytesBase64) throw badRequest("Image data is required");
  const bytes = Buffer.from(input.bytesBase64, "base64");
  if (!bytes.length || bytes.length > 1_500_000) throw badRequest("Image must be 1.5 MB or smaller");
  await client.query(
    `update promotions set banner_filename = $2, banner_mime = $3, banner_data = $4, updated_at = now() where id = $1`,
    [id, filename, mime, bytes],
  );
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: "promotion.banner",
    targetType: "promotion",
    targetId: id,
  });
  return getPromotion(client, id, { includeDraft: true });
}

export async function getPromotionOverview(client: PoolClient) {
  const now = new Date();
  const promotions = await listAdminPromotions(client);
  const counts = { draft: 0, upcoming: 0, active: 0, expired: 0, closed: 0 };
  for (const p of promotions) counts[p.lifecycle] += 1;
  const qualified = await client.query<{ n: number }>(`select count(*)::int as n from promotion_qualifications`);
  const pending = await client.query<{ n: number }>(
    `select count(*)::int as n from promotion_reward_fulfillments where status in ('eligible','approved')`,
  );
  return {
    serverNow: now.toISOString(),
    active: counts.active,
    draft: counts.draft,
    upcoming: counts.upcoming,
    expired: counts.expired,
    closed: counts.closed,
    qualified_members: qualified.rows[0]?.n ?? 0,
    pending_fulfillment: pending.rows[0]?.n ?? 0,
  };
}

function campaignMatchesOffer(
  campaign: { offer_scope: string },
  offers: PromotionOfferRef[],
  offerSlug: string,
): boolean {
  if (campaign.offer_scope === "all") return true;
  return offers.some((o) => o.slug === offerSlug);
}

export async function evaluatePromotionsForConfirmedBooking(client: PoolClient, bookingId: string, actorUserId?: string) {
  const { rows } = await client.query<{
    id: string;
    user_id: string;
    offer_slug: string;
    status: string;
    confirmed_at: string | null;
    offer_title: string;
  }>(
    `select b.id, b.user_id, b.offer_slug, b.status, b.confirmed_at, coalesce(o.title, b.offer_slug) as offer_title
       from bookings b join offers o on o.slug = b.offer_slug
      where b.id = $1`,
    [bookingId],
  );
  const booking = rows[0];
  if (!booking) return;
  if (booking.status !== "confirmed" && booking.status !== "activated") return;
  if (!booking.confirmed_at) return;
  const confirmedAt = new Date(booking.confirmed_at);
  const { rows: campaigns } = await client.query<Omit<Promotion, "offers" | "rewards" | "lifecycle">>(
    `select ${PROMO_COLS} from promotions where status = 'published' for update`,
  );
  for (const raw of campaigns) {
    const start = new Date(raw.start_at);
    const end = new Date(raw.end_at);
    if (confirmedAt.getTime() < start.getTime() || confirmedAt.getTime() >= end.getTime()) continue;
    const offers = await loadOffers(client, raw.id);
    if (!campaignMatchesOffer(raw, offers, booking.offer_slug)) continue;
    const rewards = await loadRewards(client, raw.id);
    if (!rewards.length) continue;
    const inserted = await client.query<PromotionQualification>(
      `insert into promotion_qualifications
         (id, promotion_id, user_id, booking_id, offer_slug, offer_title, booking_confirmed_at,
          promotion_title, promotion_version, terms_snapshot, terms_version, rewards_snapshot, start_at, end_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (promotion_id, user_id) do nothing
       returning *`,
      [
        uid("pq"),
        raw.id,
        booking.user_id,
        booking.id,
        booking.offer_slug,
        booking.offer_title,
        booking.confirmed_at,
        raw.title,
        raw.version,
        raw.terms,
        raw.terms_version,
        JSON.stringify(rewards),
        raw.start_at,
        raw.end_at,
      ],
    );
    const qualification = inserted.rows[0];
    if (!qualification) continue;
    for (const reward of rewards) {
      const fulfillment = await client.query<PromotionFulfillment>(
        `insert into promotion_reward_fulfillments
           (id, qualification_id, promotion_id, user_id, reward_name, reward_description, quantity,
            value_amount, instructions, display_order, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'eligible')
         returning *`,
        [
          uid("prf"),
          qualification.id,
          raw.id,
          booking.user_id,
          reward.name,
          reward.description,
          reward.quantity,
          reward.value_amount,
          reward.instructions,
          reward.display_order,
        ],
      );
      const row = fulfillment.rows[0];
      if (row) {
        await client.query(
          `insert into promotion_reward_events
             (id, fulfillment_id, qualification_id, actor_user_id, previous_status, new_status, reason)
           values ($1,$2,$3,$4,null,'eligible',$5)`,
          [uid("pre"), row.id, qualification.id, actorUserId ?? null, "Qualified from confirmed booking"],
        );
      }
    }
    await logAdminAction(client, {
      adminUserId: actorUserId ?? booking.user_id,
      actionType: "promotion.qualify",
      targetType: "promotion_qualification",
      targetId: qualification.id,
      payload: { promotionId: raw.id, bookingId: booking.id },
    });
  }
}

export async function reversePromotionRewardsForBooking(
  client: PoolClient,
  bookingId: string,
  adminId: string,
  reason: string,
) {
  const { rows } = await client.query<PromotionQualification>(
    `select * from promotion_qualifications where booking_id = $1`,
    [bookingId],
  );
  for (const qualification of rows) {
    const { rows: fulfillments } = await client.query<PromotionFulfillment>(
      `select * from promotion_reward_fulfillments
        where qualification_id = $1 and status in ('eligible','approved')
        for update`,
      [qualification.id],
    );
    for (const fulfillment of fulfillments) {
      await applyFulfillmentStatus(client, fulfillment, "reversed", adminId, reason || "Qualifying booking reversed");
    }
  }
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  eligible: ["approved", "cancelled", "reversed"],
  approved: ["fulfilled", "cancelled", "reversed"],
  fulfilled: ["reversed"],
  cancelled: [],
  reversed: [],
};

async function applyFulfillmentStatus(
  client: PoolClient,
  fulfillment: PromotionFulfillment,
  next: string,
  adminId: string,
  reason: string | null,
): Promise<PromotionFulfillment> {
  if (fulfillment.status === next) return fulfillment;
  const allowed = ALLOWED_TRANSITIONS[fulfillment.status] ?? [];
  if (!allowed.includes(next)) {
    throw conflict(`Cannot move reward from ${fulfillment.status} to ${next}`);
  }
  const { rows } = await client.query<PromotionFulfillment>(
    `update promotion_reward_fulfillments
        set status = $2, updated_at = now(), updated_by_admin_id = $3, notes = coalesce($4, notes)
      where id = $1
      returning *`,
    [fulfillment.id, next, adminId, reason],
  );
  const updated = rows[0]!;
  await client.query(
    `insert into promotion_reward_events
       (id, fulfillment_id, qualification_id, actor_user_id, previous_status, new_status, reason)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [uid("pre"), fulfillment.id, fulfillment.qualification_id, adminId, fulfillment.status, next, reason],
  );
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: `promotion.reward.${next}`,
    targetType: "promotion_reward_fulfillment",
    targetId: fulfillment.id,
    payload: { previous: fulfillment.status, next, reason },
  });
  return updated;
}

export async function setFulfillmentStatus(
  client: PoolClient,
  id: string,
  input: { status?: unknown; reason?: unknown; notes?: unknown },
  adminId: string,
): Promise<PromotionFulfillment> {
  const next = cleanText(input.status, "Status", 32, true);
  if (!FULFILLMENT_STATUSES.has(next)) throw badRequest("Invalid reward status");
  const reason = cleanText(input.reason ?? input.notes ?? "", "Reason", 500);
  if ((next === "cancelled" || next === "reversed") && !reason) {
    throw badRequest("A reason is required to cancel or reverse a reward");
  }
  const { rows } = await client.query<PromotionFulfillment>(
    `select * from promotion_reward_fulfillments where id = $1 for update`,
    [id],
  );
  if (!rows[0]) throw notFound("Reward record not found");
  return applyFulfillmentStatus(client, rows[0], next, adminId, reason || null);
}

export async function listAdminQualifications(client: PoolClient, promotionId?: string) {
  const params: unknown[] = [];
  const where = promotionId ? (params.push(promotionId), `where q.promotion_id = $1`) : "";
  const { rows } = await client.query<PromotionQualification>(
    `select q.*, u.name as user_name, u.email as user_email
       from promotion_qualifications q
       join "user" u on u.id = q.user_id
      ${where}
      order by q.qualified_at desc
      limit 300`,
    params,
  );
  const ids = rows.map((r) => r.id);
  const fulfillments = ids.length
    ? await client.query<PromotionFulfillment>(
        `select * from promotion_reward_fulfillments where qualification_id = any($1) order by display_order`,
        [ids],
      )
    : { rows: [] as PromotionFulfillment[] };
  const byQual = new Map<string, PromotionFulfillment[]>();
  for (const f of fulfillments.rows) {
    const list = byQual.get(f.qualification_id) ?? [];
    list.push(f);
    byQual.set(f.qualification_id, list);
  }
  return rows.map((q) => ({
    ...q,
    rewards_snapshot: asRewards(q.rewards_snapshot),
    fulfillments: byQual.get(q.id) ?? [],
  }));
}

export async function getAdminQualification(client: PoolClient, id: string) {
  const { rows } = await client.query<PromotionQualification>(
    `select q.*, u.name as user_name, u.email as user_email
       from promotion_qualifications q join "user" u on u.id = q.user_id
      where q.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound("Qualification not found");
  const fulfillments = await client.query<PromotionFulfillment>(
    `select * from promotion_reward_fulfillments where qualification_id = $1 order by display_order`,
    [id],
  );
  const events = await client.query<PromotionRewardEvent>(
    `select * from promotion_reward_events where qualification_id = $1 order by created_at`,
    [id],
  );
  const byF = new Map<string, PromotionRewardEvent[]>();
  for (const e of events.rows) {
    const list = byF.get(e.fulfillment_id) ?? [];
    list.push(e);
    byF.set(e.fulfillment_id, list);
  }
  return {
    ...rows[0],
    rewards_snapshot: asRewards(rows[0].rewards_snapshot),
    fulfillments: fulfillments.rows.map((f) => ({ ...f, events: byF.get(f.id) ?? [] })),
  };
}

export async function listAdminFulfillments(client: PoolClient, status?: string) {
  const params: unknown[] = [];
  const where = status && FULFILLMENT_STATUSES.has(status) ? (params.push(status), `where f.status = $1`) : "";
  const { rows } = await client.query<
    PromotionFulfillment & { user_name?: string; user_email?: string; promotion_title?: string; booking_id?: string }
  >(
    `select f.*, u.name as user_name, u.email as user_email, p.title as promotion_title, q.booking_id
       from promotion_reward_fulfillments f
       join promotion_qualifications q on q.id = f.qualification_id
       join promotions p on p.id = f.promotion_id
       join "user" u on u.id = f.user_id
      ${where}
      order by f.updated_at desc
      limit 300`,
    params,
  );
  return rows;
}

export async function getUserQualification(client: PoolClient, promotionId: string, userId: string) {
  const { rows } = await client.query<PromotionQualification>(
    `select * from promotion_qualifications where promotion_id = $1 and user_id = $2`,
    [promotionId, userId],
  );
  if (!rows[0]) return null;
  const fulfillments = await client.query<PromotionFulfillment>(
    `select * from promotion_reward_fulfillments where qualification_id = $1 order by display_order`,
    [rows[0].id],
  );
  return {
    ...rows[0],
    rewards_snapshot: asRewards(rows[0].rewards_snapshot),
    fulfillments: fulfillments.rows,
  };
}
