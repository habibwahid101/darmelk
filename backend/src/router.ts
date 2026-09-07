import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.js";
import { withTransaction, query, queryOne } from "./db.js";
import { ApiError, badRequest, notFound, unauthorized } from "./errors.js";
import { withIdempotency } from "./idempotency.js";
import {
  activateBooking,
  cancelBooking,
  confirmBooking,
  createBooking,
  reverseBooking,
} from "./engine/bookings.js";
import {
  approveActivation,
  rejectActivation,
  requestActivation,
} from "./engine/activation.js";
import { getCommissionTotals } from "./engine/commissions.js";
import { completeOnboarding, ensureMember, logAdminAction, requireAdmin } from "./engine/members.js";
import { createContactRequest, listContactRequests, updateContactRequestStatus } from "./engine/contact.js";
import { getQualificationStatus, PERSONAL_SPONSOR_TARGET, TOTAL_POSITIONS } from "./engine/network.js";
import { listLeadershipRewardSummaries, syncLeadershipReward } from "./engine/leadership.js";
import { decideWithdrawal, markWithdrawalPaid, requestWithdrawal } from "./engine/withdrawals.js";
import { createPaymentSubmission, finalizePayment, getPaymentProof, markPaymentUnderReview, PAYMENT_DESTINATIONS, type PaymentMethod, type PaymentTarget } from "./engine/payments.js";
import { uid } from "./ids.js";
import {
  addOfferMedia,
  createOffer,
  getOfferMedia,
  getOfferRow,
  listAdminOffers,
  listPublicOffers,
  removeOfferMedia,
  setOfferStatus,
  updateOffer,
  type OfferInput,
} from "./engine/offers.js";
import {
  createJob,
  getJobRow,
  listAdminJobs,
  listPublicJobs,
  setJobStatus,
  updateJob,
  type JobInput,
} from "./engine/jobs.js";
import {
  adjustMerchantCredit,
  approveMerchantPaymentRequest,
  bookingHasApprovedMerchantPayment,
  confirmMerchantPurchase,
  createBundle,
  createMerchantPaymentRequest,
  declineMerchantPaymentRequest,
  getBundle,
  getMerchantAdminDetail,
  getMerchantOverview,
  getMerchantSummary,
  listAdminBundles,
  listAdminGifts,
  listAdminLedger,
  listAdminRequests,
  listMerchantDashboard,
  listMerchants,
  listPublicBundles,
  rejectMerchantPurchase,
  setBundleStatus,
  setMerchantStatus,
  startBundlePurchase,
  updateBundle,
  updateGiftFulfillment,
} from "./engine/merchant.js";
import {
  createPromotion,
  getAdminQualification,
  getPromotion,
  getPromotionBanner,
  getPromotionOverview,
  getUserQualification,
  listAdminFulfillments,
  listAdminPromotions,
  listAdminQualifications,
  listDashboardPromotions,
  listPublicPromotions,
  setFulfillmentStatus,
  setPromotionBanner,
  setPromotionStatus,
  updatePromotion,
} from "./engine/promotions.js";

type Vars = { userId: string; userEmail: string };
const app = new Hono<{ Variables: Vars }>();

const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "https://darmelk.com,https://www.darmelk.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: trustedOrigins,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, service: "darmelk-backend", time: new Date().toISOString() }));
app.get("/api/payment-destinations", (c) => c.json({ destinations: Object.values(PAYMENT_DESTINATIONS) }));

// Better Auth mounts its whole surface (sign-up, sign-in, sign-out,
// get-session, forget-password, reset-password, ...) here, handling the raw
// Fetch Request/Response directly.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// ---- auth middleware ---------------------------------------------------
async function requireUser(c: Context<{ Variables: Vars }>): Promise<{ id: string; email: string }> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) throw unauthorized();
  return { id: session.user.id, email: session.user.email };
}

/** Parse the JSON body defensively — an empty/missing body becomes `{}`
 * rather than throwing, so callers can validate individual fields themselves
 * and return a clean 400 instead of a raw parse error. */
async function jsonBody<T extends object>(c: Context<{ Variables: Vars }>): Promise<Partial<T>> {
  try {
    return (await c.req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

app.use("/api/me/*", async (c, next) => {
  const user = await requireUser(c);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});
app.use("/api/bookings/*", async (c, next) => {
  const user = await requireUser(c);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});
app.use("/api/withdrawals/*", async (c, next) => {
  const user = await requireUser(c);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});
app.use("/api/activation/*", async (c, next) => {
  const user = await requireUser(c);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});
app.use("/api/payments/*", async (c, next) => {
  const user = await requireUser(c);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});
app.use("/api/admin/*", async (c, next) => {
  const user = await requireUser(c);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});

// ---- offers (public) ----------------------------------------------------
app.get("/api/offers", async (c) => {
  const offers = await withTransaction((client) => listPublicOffers(client));
  return c.json({ offers });
});
app.get("/api/offers/:slug/media/:id", async (c) => {
  const media = await withTransaction((client) => getOfferMedia(client, c.req.param("slug"), c.req.param("id")));
  return new Response(new Uint8Array(media.bytes), {
    headers: {
      "content-type": media.mime,
      "cache-control": "public, max-age=86400",
      "content-disposition": `inline; filename="${media.filename.replace(/["\\]/g, "_")}"`,
    },
  });
});
app.get("/api/offers/:slug", async (c) => {
  const offer = await withTransaction((client) => getOfferRow(client, c.req.param("slug")));
  return c.json({ offer });
});

app.get("/api/jobs", async (c) => {
  const jobs = await withTransaction((client) => listPublicJobs(client));
  return c.json({ jobs });
});
app.get("/api/jobs/:slug", async (c) => {
  const job = await withTransaction((client) => getJobRow(client, c.req.param("slug")));
  return c.json({ job });
});

app.get("/api/referral/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (!code) throw badRequest("Sponsor referral code is required", "sponsor_required");
  const row = await queryOne<{ referral_code: string }>(
    `select referral_code from members where referral_code = $1`,
    [code],
  );
  if (!row) throw notFound("Sponsor code not found");
  return c.json({ ok: true, referralCode: row.referral_code });
});

app.post("/api/contact", async (c) => {
  const body = await jsonBody<{ name?: string; profession?: string; mobile?: string; location?: string }>(c);
  const request = await withTransaction((client) => createContactRequest(client, body));
  return c.json({ request }, 201);
});

// ---- member profile / onboarding ----------------------------------------
app.get("/api/merchant-bundles", async (c) => {
  const bundles = await withTransaction((client) => listPublicBundles(client));
  return c.json({ bundles });
});

app.get("/api/promotions", async (c) => {
  const promotions = await withTransaction((client) => listPublicPromotions(client));
  return c.json({ promotions, serverNow: new Date().toISOString() });
});

app.get("/api/promotions/:id/banner", async (c) => {
  const media = await withTransaction((client) => getPromotionBanner(client, c.req.param("id")));
  return new Response(new Uint8Array(media.bytes), {
    headers: {
      "content-type": media.mime,
      "cache-control": "public, max-age=86400",
      "content-disposition": `inline; filename="${media.filename.replace(/["\\]/g, "_")}"`,
    },
  });
});

app.get("/api/promotions/:id", async (c) => {
  const id = c.req.param("id");
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const result = await withTransaction(async (client) => {
    const promotion = await getPromotion(client, id);
    const myQualification = session?.user?.id
      ? await getUserQualification(client, id, session.user.id)
      : null;
    return { promotion, myQualification, serverNow: new Date().toISOString() };
  });
  return c.json(result);
});

app.get("/api/me", async (c) => {
  const userId = c.get("userId");
  const email = c.get("userEmail");
  const result = await withTransaction(async (client) => {
    const member = await ensureMember(client, { id: userId, email });
    const merchant = await getMerchantSummary(client, userId);
    return { member, merchant };
  });
  return c.json(result);
});

app.post("/api/me/onboarding", async (c) => {
  const userId = c.get("userId");
  const body = await jsonBody<{ name?: string; phone?: string; sponsorCode?: string; termsAccepted?: boolean }>(c);
  if (body.termsAccepted !== true) throw badRequest("Terms & Conditions must be accepted", "terms_required");
  const member = await withTransaction(async (client) => {
    await ensureMember(client, { id: userId, email: c.get("userEmail") });
    if (body.name?.trim()) {
      await client.query(`update "user" set name = $2, "updatedAt" = now() where id = $1`, [userId, body.name.trim()]);
    }
    return completeOnboarding(client, userId, { phone: body.phone ?? "", sponsorCode: body.sponsorCode ?? "" });
  });
  return c.json({ member });
});

app.get("/api/me/network", async (c) => {
  const userId = c.get("userId");
  const result = await withTransaction(async (client) => {
    const qualification = await getQualificationStatus(client, userId);
    const directs = await client.query(
      `select m.user_id, m.referral_code, u.name, u.email, m.activation_status, m.created_at
         from members m join "user" u on u.id = m.user_id
        where m.sponsor_user_id = $1 order by m.created_at asc`,
      [userId],
    );
    return {
      qualification,
      levelCounts: qualification.levelCounts,
      directs: directs.rows,
      totalPositions: TOTAL_POSITIONS,
      sponsorTarget: PERSONAL_SPONSOR_TARGET,
    };
  });
  return c.json(result);
});

app.get("/api/me/qualification", async (c) => {
  const userId = c.get("userId");
  const status = await withTransaction((client) => getQualificationStatus(client, userId));
  const ownBooking = await queryOne(
    `select b.*, o.title as offer_title from bookings b join offers o on o.slug = b.offer_slug
      where b.user_id = $1 and b.status in ('confirmed', 'activated')
      order by b.created_at asc limit 1`,
    [userId],
  );
  return c.json({ ...status, ownBooking: ownBooking ?? null });
});

app.get("/api/me/leadership-reward", async (c) => {
  const userId = c.get("userId");
  const snapshot = await withTransaction((client) => syncLeadershipReward(client, userId));
  return c.json({ leadership: snapshot });
});

app.get("/api/me/promotions", async (c) => {
  const userId = c.get("userId");
  const dashboard = await withTransaction((client) => listDashboardPromotions(client, userId));
  return c.json(dashboard);
});

app.get("/api/me/commissions", async (c) => {
  const userId = c.get("userId");
  const [totals, rows] = await Promise.all([
    withTransaction((client) => getCommissionTotals(client, userId)),
    query(
      `select cl.*, o.title as source_offer_title, u.name as source_member_name from commission_ledger cl
         join bookings b on b.id = cl.source_booking_id
         join offers o on o.slug = b.offer_slug
         join "user" u on u.id = cl.source_user_id
        where cl.beneficiary_user_id = $1 order by cl.created_at desc`,
      [userId],
    ),
  ]);
  return c.json({ totals, commissions: rows });
});

app.get("/api/me/transactions", async (c) => {
  const userId = c.get("userId");
  const rows = await query(
    `select id, 'booking' as type, booking_amount as amount, status, created_at, offer_slug as reference
       from bookings where user_id = $1
     union all
     select id, 'commission' as type, amount, status, created_at, source_booking_id as reference
       from commission_ledger where beneficiary_user_id = $1
     union all
     select id, 'activation' as type, amount, status, requested_at as created_at, 'annual-activation' as reference
       from annual_activations where user_id = $1
     union all
     select id, 'withdrawal' as type, amount, status, requested_at as created_at, 'withdrawal' as reference
       from withdrawals where user_id = $1
     order by created_at desc`,
    [userId],
  );
  return c.json({ transactions: rows });
});

app.get("/api/me/bookings", async (c) => {
  const userId = c.get("userId");
  const rows = await query(
    `select b.*, o.title as offer_title, o.image, o.category from bookings b
       join offers o on o.slug = b.offer_slug
      where b.user_id = $1 order by b.created_at desc`,
    [userId],
  );
  return c.json({ bookings: rows });
});

app.get("/api/me/withdrawals", async (c) => {
  const userId = c.get("userId");
  const rows = await query(`select * from withdrawals where user_id = $1 order by requested_at desc`, [userId]);
  return c.json({ withdrawals: rows });
});

app.get("/api/me/payments", async (c) => {
  const rows = await query(
    `select id,target_type,target_id,user_id,amount,payment_method,destination_snapshot,reference_id,
       proof_filename,proof_mime,notes,status,submitted_at,reviewed_at,reviewed_by_admin_id,rejection_reason
       from payment_submissions where user_id = $1 order by submitted_at desc`, [c.get("userId")],
  );
  return c.json({ payments: rows });
});

app.get("/api/me/merchant", async (c) => {
  const userId = c.get("userId");
  const dashboard = await withTransaction(async (client) => {
    await ensureMember(client, { id: userId, email: c.get("userEmail") });
    return listMerchantDashboard(client, userId);
  });
  return c.json(dashboard);
});

app.post("/api/me/merchant/purchases", async (c) => {
  const userId = c.get("userId");
  const body = await jsonBody<{ bundleId?: string; termsAccepted?: boolean }>(c);
  const result = await withTransaction((client) =>
    withIdempotency(
      client,
      { key: c.req.header("Idempotency-Key"), endpoint: "POST /api/me/merchant/purchases", userId, requestBody: body },
      async () => {
        await ensureMember(client, { id: userId, email: c.get("userEmail") });
        const purchase = await startBundlePurchase(client, userId, body);
        return { status: 201, body: { purchase } };
      },
    ),
  );
  return c.json(result.body, result.status as 200 | 201);
});

app.post("/api/me/merchant/requests/:id/approve", async (c) => {
  const userId = c.get("userId");
  const requestId = c.req.param("id");
  const result = await withTransaction((client) =>
    withIdempotency(
      client,
      { key: c.req.header("Idempotency-Key"), endpoint: `POST /api/me/merchant/requests/${requestId}/approve`, userId, requestBody: {} },
      async () => {
        const request = await approveMerchantPaymentRequest(client, userId, requestId);
        return { status: 200, body: { request } };
      },
    ),
  );
  return c.json(result.body);
});

app.post("/api/me/merchant/requests/:id/decline", async (c) => {
  const userId = c.get("userId");
  const requestId = c.req.param("id");
  const result = await withTransaction((client) =>
    withIdempotency(
      client,
      { key: c.req.header("Idempotency-Key"), endpoint: `POST /api/me/merchant/requests/${requestId}/decline`, userId, requestBody: {} },
      async () => {
        const request = await declineMerchantPaymentRequest(client, userId, requestId);
        return { status: 200, body: { request } };
      },
    ),
  );
  return c.json(result.body);
});

app.get("/api/me/payout-methods", async (c) => {
  const rows = await query(`select id,method_type,details,created_at,updated_at from payout_methods where user_id=$1 order by created_at`, [c.get("userId")]);
  return c.json({ methods: rows });
});

app.post("/api/me/payout-methods", async (c) => {
  const userId = c.get("userId");
  const body = await jsonBody<{ methodType?: string; details?: Record<string, unknown> }>(c);
  if (body.methodType !== "bkash" && body.methodType !== "nagad" && body.methodType !== "bank") throw badRequest("Unsupported payout method");
  const details = body.details ?? {};
  const required = body.methodType === "bank" ? ["accountName", "accountNumber", "bankName", "branch"] : ["accountName", "accountNumber"];
  for (const field of required) {
    if (typeof details[field] !== "string" || !String(details[field]).trim()) throw badRequest(`${field} is required`);
    details[field] = String(details[field]).trim().slice(0, 160);
  }
  if (typeof details.routingNumber === "string") details.routingNumber = details.routingNumber.trim().slice(0, 80);
  const method = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into payout_methods (id,user_id,method_type,details) values ($1,$2,$3,$4)
       on conflict (user_id,method_type) do update set details=excluded.details,updated_at=now()
       returning id,method_type,details,created_at,updated_at`,
      [uid("pm"), userId, body.methodType, JSON.stringify(details)],
    );
    return rows[0];
  });
  return c.json({ method });
});

// ---- bookings -------------------------------------------------------------
app.post("/api/bookings", async (c) => {
  const userId = c.get("userId");
  const body = await jsonBody<{ offerSlug?: string }>(c);
  if (!body.offerSlug) throw badRequest("offerSlug is required");
  const idempotencyKey = c.req.header("Idempotency-Key");

  const result = await withTransaction((client) =>
    withIdempotency(
      client,
      { key: idempotencyKey, endpoint: "POST /api/bookings", userId, requestBody: body },
      async () => {
        await ensureMember(client, { id: userId, email: c.get("userEmail") });
        const booking = await createBooking(client, userId, body.offerSlug!);
        return { status: 201, body: { booking } };
      },
    ),
  );
  return c.json(result.body, result.status as 200 | 201);
});

app.get("/api/bookings/:id", async (c) => {
  const userId = c.get("userId");
  const booking = await queryOne<{ user_id: string }>(`select * from bookings where id = $1`, [c.req.param("id")]);
  if (!booking) throw notFound("Booking not found");
  if (booking.user_id !== userId) {
    await withTransaction((client) => requireAdmin(client, userId));
  }
  const merchantRequest = await queryOne(
    `select * from merchant_payment_requests where booking_id = $1 order by created_at desc limit 1`,
    [c.req.param("id")],
  );
  return c.json({ booking, merchantRequest: merchantRequest ?? null });
});

app.post("/api/bookings/:id/merchant-pay", async (c) => {
  const userId = c.get("userId");
  const bookingId = c.req.param("id");
  const body = await jsonBody<{ merchantUserId?: string }>(c);
  const result = await withTransaction((client) =>
    withIdempotency(
      client,
      { key: c.req.header("Idempotency-Key"), endpoint: `POST /api/bookings/${bookingId}/merchant-pay`, userId, requestBody: body },
      async () => {
        const request = await createMerchantPaymentRequest(client, userId, bookingId, body.merchantUserId);
        return { status: 201, body: { request } };
      },
    ),
  );
  return c.json(result.body, result.status as 200 | 201);
});

app.post("/api/payments", async (c) => {
  const userId = c.get("userId");
  const body = await jsonBody<{ targetType?: PaymentTarget; targetId?: string; paymentMethod?: PaymentMethod; referenceId?: string; proofFilename?: string; proofMime?: string; proofBase64?: string; notes?: string }>(c);
  const result = await withTransaction((client) => withIdempotency(
    client,
    { key: c.req.header("Idempotency-Key"), endpoint: "POST /api/payments", userId, requestBody: body },
    async () => ({ status: 201, body: { payment: await createPaymentSubmission(client, userId, {
      targetType: body.targetType as PaymentTarget, targetId: body.targetId ?? "", paymentMethod: body.paymentMethod as PaymentMethod,
      referenceId: body.referenceId, proofFilename: body.proofFilename, proofMime: body.proofMime,
      proofBase64: body.proofBase64, notes: body.notes,
    }) } }),
  ));
  return c.json(result.body, result.status as 200 | 201);
});

app.get("/api/payments/:id/proof", async (c) => {
  const proof = await withTransaction((client) => getPaymentProof(client, c.req.param("id"), c.get("userId")));
  return new Response(proof.proof_data, { headers: {
    "content-type": proof.proof_mime,
    "content-disposition": `inline; filename="${proof.proof_filename.replace(/[\"\\]/g, "_")}"`,
  } });
});

// ---- annual activation ------------------------------------------------
app.post("/api/activation/request", async (c) => {
  const userId = c.get("userId");
  const idempotencyKey = c.req.header("Idempotency-Key");
  const result = await withTransaction((client) =>
    withIdempotency(client, { key: idempotencyKey, endpoint: "POST /api/activation/request", userId, requestBody: {} }, async () => {
      await ensureMember(client, { id: userId, email: c.get("userEmail") });
      const activation = await requestActivation(client, userId);
      return { status: 201, body: { activation } };
    }),
  );
  return c.json(result.body, result.status as 200 | 201);
});

app.get("/api/me/activation", async (c) => {
  const userId = c.get("userId");
  const rows = await query(`select * from annual_activations where user_id = $1 order by requested_at desc`, [userId]);
  return c.json({ activations: rows });
});

// ---- withdrawals --------------------------------------------------------
app.post("/api/withdrawals", async (c) => {
  const userId = c.get("userId");
  const body = await jsonBody<{ amount?: number; payoutMethodId?: string }>(c);
  const idempotencyKey = c.req.header("Idempotency-Key");
  const result = await withTransaction((client) =>
    withIdempotency(client, { key: idempotencyKey, endpoint: "POST /api/withdrawals", userId, requestBody: body }, async () => {
      const withdrawal = await requestWithdrawal(client, userId, Number(body.amount), String(body.payoutMethodId ?? ""));
      return { status: 201, body: { withdrawal } };
    }),
  );
  return c.json(result.body, result.status as 200 | 201);
});

// ---- admin ----------------------------------------------------------------
app.get("/api/admin/bookings", async (c) => {
  const adminId = c.get("userId");
  await withTransaction((client) => requireAdmin(client, adminId));
  const status = c.req.query("status");
  const rows = status
    ? await query(
        `select b.*, o.title as offer_title, u.name as user_name, u.email as user_email,
                (select mpr.status from merchant_payment_requests mpr
                  where mpr.booking_id = b.id
                  order by mpr.created_at desc limit 1) as merchant_request_status
           from bookings b join offers o on o.slug = b.offer_slug join "user" u on u.id = b.user_id
          where b.status = $1 order by b.created_at desc`,
        [status],
      )
    : await query(
        `select b.*, o.title as offer_title, u.name as user_name, u.email as user_email,
                (select mpr.status from merchant_payment_requests mpr
                  where mpr.booking_id = b.id
                  order by mpr.created_at desc limit 1) as merchant_request_status
           from bookings b join offers o on o.slug = b.offer_slug join "user" u on u.id = b.user_id
          order by b.created_at desc`,
      );
  return c.json({ bookings: rows });
});

app.post("/api/admin/bookings/:id/confirm", async (c) => {
  const adminId = c.get("userId");
  const bookingId = c.req.param("id");
  const booking = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const paid = await client.query(`select 1 from payment_submissions where target_type='booking' and target_id=$1 and status='approved'`, [bookingId]);
    const merchantPaid = await bookingHasApprovedMerchantPayment(client, bookingId);
    if (!paid.rows[0] && !merchantPaid) throw badRequest("Approved booking payment is required");
    const result = await confirmBooking(client, bookingId, adminId);
    await logAdminAction(client, { adminUserId: adminId, actionType: "booking.confirm", targetType: "booking", targetId: bookingId });
    return result;
  });
  return c.json({ booking });
});

app.post("/api/admin/bookings/:id/activate", async (c) => {
  const adminId = c.get("userId");
  const bookingId = c.req.param("id");
  const booking = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await activateBooking(client, bookingId);
    await logAdminAction(client, { adminUserId: adminId, actionType: "booking.activate", targetType: "booking", targetId: bookingId });
    return result;
  });
  return c.json({ booking });
});

app.post("/api/admin/bookings/:id/cancel", async (c) => {
  const adminId = c.get("userId");
  const bookingId = c.req.param("id");
  const booking = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await cancelBooking(client, bookingId);
    await logAdminAction(client, { adminUserId: adminId, actionType: "booking.cancel", targetType: "booking", targetId: bookingId });
    return result;
  });
  return c.json({ booking });
});

app.post("/api/admin/bookings/:id/reverse", async (c) => {
  const adminId = c.get("userId");
  const bookingId = c.req.param("id");
  const body = await jsonBody<{ reason?: string }>(c);
  if (!body.reason?.trim()) throw badRequest("reason is required to reverse a booking");
  const result = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const outcome = await reverseBooking(client, bookingId, { reason: body.reason!.trim(), adminUserId: adminId });
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "booking.reverse",
      targetType: "booking",
      targetId: bookingId,
      payload: { reason: body.reason, commissionsReversed: outcome.commissionsReversed },
    });
    return outcome;
  });
  return c.json(result);
});

app.get("/api/admin/commissions", async (c) => {
  const adminId = c.get("userId");
  await withTransaction((client) => requireAdmin(client, adminId));
  const rows = await query(
    `select cl.*, u.name as beneficiary_name, u.email as beneficiary_email
       from commission_ledger cl join "user" u on u.id = cl.beneficiary_user_id
      order by cl.created_at desc`,
  );
  return c.json({ commissions: rows });
});

app.get("/api/admin/withdrawals", async (c) => {
  const adminId = c.get("userId");
  await withTransaction((client) => requireAdmin(client, adminId));
  const rows = await query(
    `select w.*, u.name as user_name, u.email as user_email,
       (m.activation_status='active' and m.activation_expires_at > now()) as member_active,
       exists(select 1 from bookings b where b.user_id=w.user_id and b.status in ('confirmed','activated')) as own_booking_eligible
       from withdrawals w join "user" u on u.id = w.user_id join members m on m.user_id=w.user_id
      order by w.requested_at desc`,
  );
  return c.json({ withdrawals: rows });
});

app.post("/api/admin/withdrawals/:id/:decision", async (c) => {
  const adminId = c.get("userId");
  const decisionParam = c.req.param("decision");
  if (decisionParam !== "approve" && decisionParam !== "reject" && decisionParam !== "mark-paid") {
    throw notFound();
  }
  const withdrawalId = c.req.param("id");
  const body = await jsonBody<{ paymentReference?: string }>(c);
  const withdrawal = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = decisionParam === "mark-paid"
      ? await markWithdrawalPaid(client, withdrawalId, adminId, body.paymentReference ?? "")
      : await decideWithdrawal(client, withdrawalId, decisionParam === "approve" ? "approved" : "rejected", adminId);
    await logAdminAction(client, { adminUserId: adminId, actionType: `withdrawal.${decisionParam}`, targetType: "withdrawal", targetId: withdrawalId, payload: decisionParam === "mark-paid" ? { paymentReference: body.paymentReference, amount: result.amount, feeAmount: result.fee_amount, netAmount: result.net_amount, paidAt: result.paid_at, paidByAdmin: adminId } : {} });
    return result;
  });
  return c.json({ withdrawal });
});

app.get("/api/admin/activations", async (c) => {
  const adminId = c.get("userId");
  await withTransaction((client) => requireAdmin(client, adminId));
  const rows = await query(
    `select a.*, u.name as user_name, u.email as user_email
       from annual_activations a join "user" u on u.id = a.user_id
      order by a.requested_at desc`,
  );
  return c.json({ activations: rows });
});

app.post("/api/admin/activations/:id/:decision", async (c) => {
  const adminId = c.get("userId");
  const decisionParam = c.req.param("decision");
  if (decisionParam !== "approve" && decisionParam !== "reject") throw notFound();
  const activationId = c.req.param("id");
  const activation = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    if (decisionParam === "approve") {
      const paid = await client.query(`select 1 from payment_submissions where target_type='activation' and target_id=$1 and status='approved'`, [activationId]);
      if (!paid.rows[0]) throw badRequest("Approved activation payment is required");
    }
    const result =
      decisionParam === "approve"
        ? await approveActivation(client, activationId, adminId)
        : await rejectActivation(client, activationId, adminId);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: `activation.${decisionParam}`,
      targetType: "annual_activation",
      targetId: activationId,
    });
    return result;
  });
  return c.json({ activation });
});

app.get("/api/admin/payments", async (c) => {
  await withTransaction((client) => requireAdmin(client, c.get("userId")));
  const rows = await query(
    `select p.id,p.target_type,p.target_id,p.user_id,p.amount,p.payment_method,p.destination_snapshot,
       p.reference_id,p.proof_filename,p.proof_mime,p.notes,p.status,p.submitted_at,p.reviewed_at,
       p.reviewed_by_admin_id,p.rejection_reason,u.name as user_name,u.email as user_email
       from payment_submissions p join "user" u on u.id=p.user_id order by p.submitted_at desc`,
  );
  return c.json({ payments: rows });
});

app.post("/api/admin/payments/:id/review", async (c) => {
  const adminId = c.get("userId");
  const payment = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await markPaymentUnderReview(client, c.req.param("id"), adminId);
    await logAdminAction(client, { adminUserId: adminId, actionType: "payment.review", targetType: "payment", targetId: result.id });
    return result;
  });
  return c.json({ payment });
});

app.post("/api/admin/payments/:id/:decision", async (c) => {
  const adminId = c.get("userId");
  const decision = c.req.param("decision");
  if (decision !== "approve" && decision !== "reject") throw notFound();
  const body = await jsonBody<{ reason?: string }>(c);
  const payment = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await finalizePayment(client, c.req.param("id"), decision === "approve" ? "approved" : "rejected", adminId, body.reason);
    if (decision === "approve") {
      if (result.target_type === "activation") await approveActivation(client, result.target_id, adminId);
      else if (result.target_type === "merchant_bundle") await confirmMerchantPurchase(client, result.target_id, adminId);
      else {
        await confirmBooking(client, result.target_id, adminId);
        await activateBooking(client, result.target_id);
      }
    } else if (result.target_type === "activation") await rejectActivation(client, result.target_id, adminId);
    else if (result.target_type === "merchant_bundle") await rejectMerchantPurchase(client, result.target_id);
    else await cancelBooking(client, result.target_id);
    await logAdminAction(client, { adminUserId: adminId, actionType: `payment.${decision}`, targetType: "payment", targetId: result.id, payload: { targetType: result.target_type, targetId: result.target_id, reason: body.reason } });
    return result;
  });
  return c.json({ payment });
});

app.get("/api/admin/users", async (c) => {
  const adminId = c.get("userId");
  await withTransaction((client) => requireAdmin(client, adminId));
  const rows = await query(
    `select m.*, u.name, u.email from members m join "user" u on u.id = m.user_id order by m.created_at desc`,
  );
  return c.json({ members: rows });
});

app.get("/api/admin/contact-requests", async (c) => {
  const adminId = c.get("userId");
  const requests = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listContactRequests(client);
  });
  return c.json({ requests });
});

app.post("/api/admin/contact-requests/:id/status", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<{ status?: string }>(c);
  const request = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await updateContactRequestStatus(client, c.req.param("id"), body.status ?? "", adminId);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "contact.status",
      targetType: "contact_request",
      targetId: result.id,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ request });
});

app.post("/api/admin/users/:id/role", async (c) => {
  const adminId = c.get("userId");
  const targetId = c.req.param("id");
  const body = await jsonBody<{ role?: "admin" | "member" }>(c);
  if (body.role !== "admin" && body.role !== "member") throw badRequest("role must be admin or member");
  const member = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const { rows } = await client.query(`update members set role = $2, updated_at = now() where user_id = $1 returning *`, [
      targetId,
      body.role,
    ]);
    if (!rows[0]) throw notFound("Member not found");
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "user.set_role",
      targetType: "member",
      targetId,
      payload: { role: body.role },
    });
    return rows[0];
  });
  return c.json({ member });
});

app.get("/api/admin/offers", async (c) => {
  const adminId = c.get("userId");
  const offers = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminOffers(client);
  });
  return c.json({ offers });
});

app.get("/api/admin/offers/:slug", async (c) => {
  const adminId = c.get("userId");
  const offer = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getOfferRow(client, c.req.param("slug"), { includeDraft: true });
  });
  return c.json({ offer });
});

app.post("/api/admin/offers", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<OfferInput>(c);
  const offer = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await createOffer(client, body);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "offer.create",
      targetType: "offer",
      targetId: result.slug,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ offer }, 201);
});

app.post("/api/admin/offers/:slug/status", async (c) => {
  const adminId = c.get("userId");
  const slug = c.req.param("slug");
  const body = await jsonBody<{ status?: string }>(c);
  const offer = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await setOfferStatus(client, slug, body.status ?? "");
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "offer.status",
      targetType: "offer",
      targetId: slug,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ offer });
});

app.post("/api/admin/offers/:slug/media", async (c) => {
  const adminId = c.get("userId");
  const slug = c.req.param("slug");
  const body = await jsonBody<{ kind?: string; filename?: string; mime?: string; bytesBase64?: string; alt?: string }>(c);
  const result = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const added = await addOfferMedia(client, slug, body);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "offer.media.add",
      targetType: "offer",
      targetId: slug,
      payload: { id: added.id, kind: body.kind },
    });
    return added;
  });
  return c.json(result, 201);
});

app.post("/api/admin/offers/:slug/media/:id/remove", async (c) => {
  const adminId = c.get("userId");
  const slug = c.req.param("slug");
  const mediaId = c.req.param("id");
  const offer = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await removeOfferMedia(client, slug, mediaId);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "offer.media.remove",
      targetType: "offer",
      targetId: slug,
      payload: { id: mediaId },
    });
    return result;
  });
  return c.json({ offer });
});

app.post("/api/admin/offers/:slug", async (c) => {
  const adminId = c.get("userId");
  const slug = c.req.param("slug");
  const body = await jsonBody<OfferInput>(c);
  const offer = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await updateOffer(client, slug, body);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "offer.update",
      targetType: "offer",
      targetId: slug,
      payload: { version: result.version, status: result.status },
    });
    return result;
  });
  return c.json({ offer });
});

app.get("/api/admin/jobs", async (c) => {
  const adminId = c.get("userId");
  const jobs = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminJobs(client);
  });
  return c.json({ jobs });
});

app.get("/api/admin/jobs/:slug", async (c) => {
  const adminId = c.get("userId");
  const job = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getJobRow(client, c.req.param("slug"), { includeDraft: true });
  });
  return c.json({ job });
});

app.post("/api/admin/jobs", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<JobInput>(c);
  const job = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await createJob(client, body);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "job.create",
      targetType: "job",
      targetId: result.slug,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ job }, 201);
});

app.post("/api/admin/jobs/:slug/status", async (c) => {
  const adminId = c.get("userId");
  const slug = c.req.param("slug");
  const body = await jsonBody<{ status?: string }>(c);
  const job = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await setJobStatus(client, slug, body.status ?? "");
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "job.status",
      targetType: "job",
      targetId: slug,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ job });
});

app.post("/api/admin/jobs/:slug", async (c) => {
  const adminId = c.get("userId");
  const slug = c.req.param("slug");
  const body = await jsonBody<JobInput>(c);
  const job = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await updateJob(client, slug, body);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "job.update",
      targetType: "job",
      targetId: slug,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ job });
});

app.get("/api/admin/merchant/overview", async (c) => {
  const adminId = c.get("userId");
  const overview = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getMerchantOverview(client);
  });
  return c.json({ overview });
});

app.get("/api/admin/merchant/bundles", async (c) => {
  const adminId = c.get("userId");
  const bundles = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminBundles(client);
  });
  return c.json({ bundles });
});

app.get("/api/admin/merchant/bundles/:id", async (c) => {
  const adminId = c.get("userId");
  const bundle = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getBundle(client, c.req.param("id"), { includeInactive: true });
  });
  return c.json({ bundle });
});

app.post("/api/admin/merchant/bundles", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<Record<string, unknown>>(c);
  const bundle = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await createBundle(client, body);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "merchant.bundle.create",
      targetType: "merchant_bundle",
      targetId: result.id,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ bundle }, 201);
});

app.post("/api/admin/merchant/bundles/:id/status", async (c) => {
  const adminId = c.get("userId");
  const id = c.req.param("id");
  const body = await jsonBody<{ status?: string }>(c);
  const bundle = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await setBundleStatus(client, id, body.status ?? "");
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "merchant.bundle.status",
      targetType: "merchant_bundle",
      targetId: id,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ bundle });
});

app.post("/api/admin/merchant/bundles/:id", async (c) => {
  const adminId = c.get("userId");
  const id = c.req.param("id");
  const body = await jsonBody<Record<string, unknown>>(c);
  const bundle = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await updateBundle(client, id, body);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "merchant.bundle.update",
      targetType: "merchant_bundle",
      targetId: id,
      payload: { version: result.version, status: result.status },
    });
    return result;
  });
  return c.json({ bundle });
});

app.get("/api/admin/merchant/accounts", async (c) => {
  const adminId = c.get("userId");
  const merchants = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listMerchants(client);
  });
  return c.json({ merchants });
});

app.get("/api/admin/merchant/accounts/:userId", async (c) => {
  const adminId = c.get("userId");
  const detail = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getMerchantAdminDetail(client, c.req.param("userId"));
  });
  return c.json(detail);
});

app.post("/api/admin/merchant/accounts/:userId/status", async (c) => {
  const adminId = c.get("userId");
  const targetId = c.req.param("userId");
  const body = await jsonBody<{ status?: string }>(c);
  const merchant = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await setMerchantStatus(client, targetId, body.status ?? "");
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "merchant.status",
      targetType: "merchant",
      targetId,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ merchant });
});

app.post("/api/admin/merchant/accounts/:userId/adjust", async (c) => {
  const adminId = c.get("userId");
  const targetId = c.req.param("userId");
  const body = await jsonBody<{ amount?: number; direction?: string; reason?: string }>(c);
  const merchant = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await adjustMerchantCredit(client, targetId, body, adminId);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "merchant.adjust",
      targetType: "merchant",
      targetId,
      payload: { amount: body.amount, direction: body.direction, reason: body.reason },
    });
    return result;
  });
  return c.json({ merchant });
});

app.get("/api/admin/merchant/requests", async (c) => {
  const adminId = c.get("userId");
  const requests = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminRequests(client, c.req.query("status"));
  });
  return c.json({ requests });
});

app.get("/api/admin/merchant/ledger", async (c) => {
  const adminId = c.get("userId");
  const entries = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminLedger(client, { userId: c.req.query("userId"), entryType: c.req.query("entryType") });
  });
  return c.json({ entries });
});

app.get("/api/admin/merchant/gifts", async (c) => {
  const adminId = c.get("userId");
  const gifts = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminGifts(client, c.req.query("status"));
  });
  return c.json({ gifts });
});

app.post("/api/admin/merchant/gifts/:id/status", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<{ status?: string; notes?: string }>(c);
  const gift = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const result = await updateGiftFulfillment(client, c.req.param("id"), body, adminId);
    await logAdminAction(client, {
      adminUserId: adminId,
      actionType: "merchant.gift.status",
      targetType: "merchant_gift",
      targetId: result.id,
      payload: { status: result.status },
    });
    return result;
  });
  return c.json({ gift });
});

app.get("/api/admin/promotions/overview", async (c) => {
  const adminId = c.get("userId");
  const overview = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getPromotionOverview(client);
  });
  return c.json({ overview });
});

app.get("/api/admin/promotions", async (c) => {
  const adminId = c.get("userId");
  const promotions = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminPromotions(client);
  });
  return c.json({ promotions, serverNow: new Date().toISOString() });
});

app.get("/api/admin/promotions/qualifications", async (c) => {
  const adminId = c.get("userId");
  const rows = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminQualifications(client, c.req.query("promotionId"));
  });
  return c.json({ qualifications: rows });
});

app.get("/api/admin/promotions/qualifications/:id", async (c) => {
  const adminId = c.get("userId");
  const qualification = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getAdminQualification(client, c.req.param("id"));
  });
  return c.json({ qualification });
});

app.get("/api/admin/promotions/rewards", async (c) => {
  const adminId = c.get("userId");
  const rewards = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listAdminFulfillments(client, c.req.query("status"));
  });
  return c.json({ rewards });
});

app.post("/api/admin/promotions/rewards/:id/status", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<{ status?: string; reason?: string; notes?: string }>(c);
  const reward = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return setFulfillmentStatus(client, c.req.param("id"), body, adminId);
  });
  return c.json({ reward });
});

app.get("/api/admin/promotions/:id", async (c) => {
  const adminId = c.get("userId");
  const promotion = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getPromotion(client, c.req.param("id"), { includeDraft: true });
  });
  return c.json({ promotion, serverNow: new Date().toISOString() });
});

app.get("/api/admin/promotions/:id/banner", async (c) => {
  const adminId = c.get("userId");
  const media = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return getPromotionBanner(client, c.req.param("id"), { includeDraft: true });
  });
  return new Response(new Uint8Array(media.bytes), {
    headers: {
      "content-type": media.mime,
      "cache-control": "private, max-age=60",
      "content-disposition": `inline; filename="${media.filename.replace(/["\\]/g, "_")}"`,
    },
  });
});

app.post("/api/admin/promotions", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<Record<string, unknown>>(c);
  const promotion = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return createPromotion(client, body, adminId);
  });
  return c.json({ promotion }, 201);
});

app.post("/api/admin/promotions/:id", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<Record<string, unknown>>(c);
  const promotion = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return updatePromotion(client, c.req.param("id"), body, adminId);
  });
  return c.json({ promotion });
});

app.post("/api/admin/promotions/:id/status", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<{ status?: string }>(c);
  const promotion = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return setPromotionStatus(client, c.req.param("id"), body.status ?? "", adminId);
  });
  return c.json({ promotion });
});

app.post("/api/admin/promotions/:id/banner", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<{ filename?: string; mime?: string; bytesBase64?: string }>(c);
  const promotion = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return setPromotionBanner(client, c.req.param("id"), body, adminId);
  });
  return c.json({ promotion });
});

app.get("/api/admin/leadership-rewards", async (c) => {
  const adminId = c.get("userId");
  const rows = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    return listLeadershipRewardSummaries(client);
  });
  return c.json({ rewards: rows });
});

app.get("/api/admin/leadership-rewards/:userId", async (c) => {
  const adminId = c.get("userId");
  const targetId = c.req.param("userId");
  const result = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const member = await client.query<{ name: string; email: string; referral_code: string }>(
      `select u.name, u.email, m.referral_code
         from members m join "user" u on u.id = m.user_id
        where m.user_id = $1`,
      [targetId],
    );
    if (!member.rows[0]) throw notFound("Member not found");
    const snapshot = await syncLeadershipReward(client, targetId);
    return { member: { userId: targetId, ...member.rows[0] }, leadership: snapshot };
  });
  return c.json(result);
});

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400 | 401 | 403 | 404 | 409);
  }
  console.error("[api] unhandled error", err);
  return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
});

export { app };
