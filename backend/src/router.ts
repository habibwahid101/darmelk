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
import { getQualificationStatus, PERSONAL_SPONSOR_TARGET, TOTAL_POSITIONS } from "./engine/network.js";
import { decideWithdrawal, markWithdrawalPaid, requestWithdrawal } from "./engine/withdrawals.js";

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
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, service: "darmelk-backend", time: new Date().toISOString() }));

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
app.use("/api/admin/*", async (c, next) => {
  const user = await requireUser(c);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});

// ---- offers (public) ----------------------------------------------------
app.get("/api/offers", async (c) => {
  const offers = await query(`select * from offers order by flagship desc, created_at asc`);
  return c.json({ offers });
});
app.get("/api/offers/:slug", async (c) => {
  const offer = await queryOne(`select * from offers where slug = $1`, [c.req.param("slug")]);
  if (!offer) throw notFound("Offer not found");
  return c.json({ offer });
});

// ---- member profile / onboarding ----------------------------------------
app.get("/api/me", async (c) => {
  const userId = c.get("userId");
  const email = c.get("userEmail");
  const member = await withTransaction((client) => ensureMember(client, { id: userId, email }));
  return c.json({ member });
});

app.post("/api/me/onboarding", async (c) => {
  const userId = c.get("userId");
  const body = await jsonBody<{ name?: string; phone?: string; sponsorCode?: string }>(c);
  if (!body.phone) throw badRequest("phone is required");
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

app.get("/api/me/commissions", async (c) => {
  const userId = c.get("userId");
  const [totals, rows] = await Promise.all([
    withTransaction((client) => getCommissionTotals(client, userId)),
    query(
      `select cl.*, o.title as source_offer_title from commission_ledger cl
         join bookings b on b.id = cl.source_booking_id
         join offers o on o.slug = b.offer_slug
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
  return c.json({ booking });
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
  const body = await jsonBody<{ amount?: number }>(c);
  const idempotencyKey = c.req.header("Idempotency-Key");
  const result = await withTransaction((client) =>
    withIdempotency(client, { key: idempotencyKey, endpoint: "POST /api/withdrawals", userId, requestBody: body }, async () => {
      const withdrawal = await requestWithdrawal(client, userId, Number(body.amount));
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
        `select b.*, o.title as offer_title, u.name as user_name, u.email as user_email
           from bookings b join offers o on o.slug = b.offer_slug join "user" u on u.id = b.user_id
          where b.status = $1 order by b.created_at desc`,
        [status],
      )
    : await query(
        `select b.*, o.title as offer_title, u.name as user_name, u.email as user_email
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
    `select w.*, u.name as user_name, u.email as user_email
       from withdrawals w join "user" u on u.id = w.user_id
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
  const withdrawal = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    if (decisionParam === "mark-paid") return markWithdrawalPaid(client, withdrawalId);
    return decideWithdrawal(client, withdrawalId, decisionParam === "approve" ? "approved" : "rejected", adminId);
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

app.get("/api/admin/users", async (c) => {
  const adminId = c.get("userId");
  await withTransaction((client) => requireAdmin(client, adminId));
  const rows = await query(
    `select m.*, u.name, u.email from members m join "user" u on u.id = m.user_id order by m.created_at desc`,
  );
  return c.json({ members: rows });
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

app.post("/api/admin/offers", async (c) => {
  const adminId = c.get("userId");
  const body = await jsonBody<Record<string, unknown>>(c);
  const offer = await withTransaction(async (client) => {
    await requireAdmin(client, adminId);
    const { rows } = await client.query(
      `insert into offers (slug, title, category, category_slug, location, image, hero_image, retail_value, booking_amount, qualification_benefit, status, flagship, summary)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (slug) do update set
         title = excluded.title, category = excluded.category, category_slug = excluded.category_slug,
         location = excluded.location, image = excluded.image, hero_image = excluded.hero_image,
         retail_value = excluded.retail_value, booking_amount = excluded.booking_amount,
         qualification_benefit = excluded.qualification_benefit, status = excluded.status,
         flagship = excluded.flagship, summary = excluded.summary, updated_at = now()
       returning *`,
      [
        body.slug, body.title, body.category, body.categorySlug ?? body.category_slug, body.location ?? null,
        body.image ?? null, body.heroImage ?? body.hero_image ?? null, body.retailValue ?? body.retail_value,
        body.bookingAmount ?? body.booking_amount, body.qualificationBenefit ?? body.qualification_benefit,
        body.status ?? "available", Boolean(body.flagship), body.summary ?? "",
      ],
    );
    await logAdminAction(client, { adminUserId: adminId, actionType: "offer.upsert", targetType: "offer", targetId: String(body.slug), payload: body });
    return rows[0];
  });
  return c.json({ offer });
});

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400 | 401 | 403 | 404 | 409);
  }
  console.error("[api] unhandled error", err);
  return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
});

export { app };
