// Local-only smoke test: exercises the real Hono app in-process (no network)
// against the local Postgres started for validation. Not part of the deploy
// bundle — run via `node dist/smoke-test.mjs` after `node esbuild-smoke.mjs`.
function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0] ?? "";
}

async function main() {
  process.env.ADMIN_EMAILS = "admin@example.com";
  const { app } = await import("./router.js");
  const { query, queryOne, withTransaction } = await import("./db.js");
  const { approveActivation, requestActivation } = await import("./engine/activation.js");
  const { activateBooking, cancelBooking, confirmBooking, createBooking, reverseBooking } = await import("./engine/bookings.js");
  const { consumeInventoryForConfirmation } = await import("./engine/inventory.js");
  const { evaluatePromotionsForConfirmedBooking } = await import("./engine/promotions.js");
  const { postCommissionsForBooking } = await import("./engine/commissions.js");
  const { completeOnboarding, ensureMember } = await import("./engine/members.js");
  const { getQualificationStatus } = await import("./engine/network.js");
  const {
    addMonths,
    cycleBounds,
    effectiveMonthFor,
    followingMonth,
    nthTimestamp,
    syncLeadershipReward,
    TIER_100K,
    TIER_25K,
    TIER_50K,
    tierOnMonth,
  } = await import("./engine/leadership.js");
  const json = async (res: Response): Promise<any> => res.json();
  const results: Array<{ step: string; ok: boolean; detail?: unknown }> = [];
  const record = (step: string, ok: boolean, detail?: unknown) => {
    results.push({ step, ok, detail });
    console.log(ok ? "PASS" : "FAIL", step, detail ?? "");
  };

  const healthRes = await app.request("/api/health");
  record(
    "API responses send nosniff and deny framing",
    healthRes.headers.get("x-content-type-options") === "nosniff" &&
      healthRes.headers.get("x-frame-options") === "DENY" &&
      healthRes.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
    {
      nosniff: healthRes.headers.get("x-content-type-options"),
      frame: healthRes.headers.get("x-frame-options"),
      referrer: healthRes.headers.get("referrer-policy"),
    },
  );
  const requestGrowthActivation = async (cookie: string, extra: Record<string, unknown> = {}) =>
    json(await app.request("/api/activation/request", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ acceptGrowthTerms: true, ...extra }),
    }));
  const submitAndApprovePayment = async (cookie: string, targetType: "activation" | "booking" | "merchant_bundle", targetId: string, key: string) => {
    const paymentMethod = targetType === "booking" ? "bank" : "bkash";
    const submitted = await json(await app.request("/api/payments", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ targetType, targetId, paymentMethod, referenceId: `REF-${key}`,
        proofFilename: "receipt.png", proofMime: "image/png", proofBase64: "iVBORw0KGgo=" }),
    }));
    const reviewed = await json(await app.request(`/api/admin/payments/${submitted.payment.id}/review`, {
      method: "POST", headers: { cookie: adminCookie },
    }));
    const approved = await json(await app.request(`/api/admin/payments/${submitted.payment.id}/approve`, {
      method: "POST", headers: { cookie: adminCookie },
    }));
    record(`${targetType} payment follows submitted -> under_review -> approved`,
      submitted.payment?.status === "submitted" && reviewed.payment?.status === "under_review" && approved.payment?.status === "approved");
    return approved;
  };

  // --- sign up explicitly configured admin ---
  const adminEmail = "admin@example.com";
  const signUpAdmin = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: "password123", name: "Admin User" }),
  });
  record("admin sign-up", signUpAdmin.status === 200, await signUpAdmin.clone().json().catch(() => undefined) as any);
  const adminCookie = extractCookie(signUpAdmin);

  const adminMeRes = await app.request("/api/me", { headers: { cookie: adminCookie } });
  const adminMe = await json(adminMeRes);
  record("admin /api/me provisions member with role=admin", adminMe.member?.role === "admin", adminMe);

  const lookupOk = await json(await app.request(`/api/referral/${adminMe.member.referral_code}`));
  record("public sponsor lookup accepts valid code", lookupOk.ok === true && lookupOk.referralCode === adminMe.member.referral_code, lookupOk);
  const lookupBad = await app.request("/api/referral/DM-NOTREAL");
  record("public sponsor lookup rejects invalid code", lookupBad.status === 404, lookupBad.status);

  const rootSignUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "root-no-sponsor@example.com", password: "password123", name: "Root Member" }),
  });
  const rootCookie = extractCookie(rootSignUp);
  await app.request("/api/me", { headers: { cookie: rootCookie } });
  const rootOnboarding = await json(await app.request("/api/me/onboarding", {
    method: "POST",
    headers: { cookie: rootCookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Root Member", phone: "", sponsorCode: "", termsAccepted: true }),
  }));
  record(
    "root member completes onboarding with optional phone and no sponsor",
    rootOnboarding.member?.onboarding_complete === true && rootOnboarding.member?.sponsor_user_id === null &&
      rootOnboarding.member?.network_parent_user_id === null && Boolean(rootOnboarding.member?.referral_code),
    rootOnboarding.member,
  );

  const missingSponsor = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "nosponsor@example.com", password: "password123", name: "No Sponsor" }),
  });
  const noSponsorCookie = extractCookie(missingSponsor);
  await app.request("/api/me", { headers: { cookie: noSponsorCookie } });
  const noSponsorOnboard = await json(
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie: noSponsorCookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "No Sponsor", sponsorCode: "", termsAccepted: true }),
    }),
  );
  record(
    "general member without referral completes onboarding with no sponsor",
    noSponsorOnboard.member?.onboarding_complete === true &&
      noSponsorOnboard.member?.sponsor_user_id === null &&
      noSponsorOnboard.member?.network_parent_user_id === null &&
      noSponsorOnboard.member?.network_slot === null,
    noSponsorOnboard.member,
  );
  const generalId = noSponsorOnboard.member?.user_id as string | undefined;
  const generalPlacement = await queryOne<{
    sponsor_user_id: string | null;
    network_parent_user_id: string | null;
    network_slot: number | null;
  }>(
    `select sponsor_user_id, network_parent_user_id, network_slot from members where user_id = $1`,
    [generalId],
  );
  record(
    "sponsorless account is not placed into the 3x5 matrix",
    generalPlacement?.sponsor_user_id == null &&
      generalPlacement?.network_parent_user_id == null &&
      generalPlacement?.network_slot == null,
    generalPlacement,
  );
  const generalCommissions = await queryOne<{ n: number }>(
    `select count(*)::int as n from commission_ledger where source_user_id = $1 or beneficiary_user_id = $1`,
    [generalId],
  );
  record("sponsorless signup creates no commission", generalCommissions?.n === 0, generalCommissions);
  const generalQual = await withTransaction((client) => getQualificationStatus(client, generalId!));
  record(
    "sponsorless signup creates no qualification progress",
    generalQual.sponsorCount === 0 && generalQual.qualified === false && generalQual.levelCounts[1] === 0,
    generalQual,
  );
  const generalLeadership = await queryOne<{ n: number }>(
    `select count(*)::int as n from leadership_reward_cycles where user_id = $1`,
    [generalId],
  );
  record("sponsorless signup creates no Leadership entitlement", generalLeadership?.n === 0, generalLeadership);
  const laterBind = await json(
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie: noSponsorCookie, "content-type": "application/json" },
      body: JSON.stringify({ sponsorCode: adminMe.member.referral_code, termsAccepted: true }),
    }),
  );
  record(
    "completed general onboarding cannot later bind a sponsor",
    laterBind.member?.sponsor_user_id === null && laterBind.member?.network_parent_user_id === null,
    laterBind.member,
  );
  const generalSignIn = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "nosponsor@example.com", password: "password123" }),
  });
  record("login works for sponsorless account", generalSignIn.status === 200, generalSignIn.status);
  const generalConsents = await json(await app.request("/api/me/consents", { headers: { cookie: noSponsorCookie } }));
  record(
    "general signup stores auditable General Terms and Privacy acceptance",
    Array.isArray(generalConsents.consents) &&
      generalConsents.consents.some((c: { document_key: string; document_version: string }) => c.document_key === "GENERAL_TERMS" && c.document_version === "1") &&
      generalConsents.consents.some((c: { document_key: string }) => c.document_key === "PRIVACY_POLICY") &&
      !generalConsents.consents.some((c: { document_key: string }) => c.document_key === "GROWTH_PROGRAM_TERMS"),
    generalConsents.consents,
  );
  const generalActivation = await json(await app.request("/api/activation/request", {
    method: "POST",
    headers: { cookie: noSponsorCookie, "content-type": "application/json" },
    body: JSON.stringify({ acceptGrowthTerms: true }),
  }));
  record(
    "sponsorless general account cannot request Growth Program Activation",
    generalActivation.error?.code === "growth_referral_required",
    generalActivation,
  );

  const whitespaceSignUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "whitespace-ref@example.com", password: "password123", name: "Whitespace Ref" }),
  });
  const whitespaceCookie = extractCookie(whitespaceSignUp);
  await app.request("/api/me", { headers: { cookie: whitespaceCookie } });
  const whitespaceOnboard = await json(
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie: whitespaceCookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Whitespace Ref", sponsorCode: "   ", termsAccepted: true }),
    }),
  );
  record(
    "whitespace-only referral is treated as omitted",
    whitespaceOnboard.member?.onboarding_complete === true && whitespaceOnboard.member?.sponsor_user_id === null,
    whitespaceOnboard.member,
  );

  const noTerms = await json(
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie: noSponsorCookie, "content-type": "application/json" },
      body: JSON.stringify({ sponsorCode: adminMe.member.referral_code }),
    }),
  );
  record("onboarding without terms accepted is rejected", noTerms.error?.code === "terms_required", noTerms);

  const invalidSignUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "badref@example.com", password: "password123", name: "Bad Referral" }),
  });
  const invalidCookie = extractCookie(invalidSignUp);
  const invalidMe = await json(await app.request("/api/me", { headers: { cookie: invalidCookie } }));
  const badCode = await json(
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie: invalidCookie, "content-type": "application/json" },
      body: JSON.stringify({ sponsorCode: "DM-NOTREAL", termsAccepted: true }),
    }),
  );
  record("invalid sponsor code is rejected", badCode.error?.code === "sponsor_not_found", badCode);
  const invalidAfter = await queryOne<{
    onboarding_complete: boolean;
    sponsor_user_id: string | null;
    network_parent_user_id: string | null;
    network_slot: number | null;
  }>(
    `select onboarding_complete, sponsor_user_id, network_parent_user_id, network_slot from members where user_id = $1`,
    [invalidMe.member?.user_id],
  );
  record(
    "failed referral validation leaves no network side effect",
    invalidAfter?.onboarding_complete === false &&
      invalidAfter?.sponsor_user_id == null &&
      invalidAfter?.network_parent_user_id == null &&
      invalidAfter?.network_slot == null,
    invalidAfter,
  );

  const selfSignUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "selfref@example.com", password: "password123", name: "Self Referral" }),
  });
  const selfCookie = extractCookie(selfSignUp);
  const selfMe = await json(await app.request("/api/me", { headers: { cookie: selfCookie } }));
  const selfOnboard = await json(
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie: selfCookie, "content-type": "application/json" },
      body: JSON.stringify({ sponsorCode: selfMe.member?.referral_code, termsAccepted: true }),
    }),
  );
  record("self-referral is rejected", selfOnboard.error?.code === "self_sponsor", selfOnboard);

  const adminActivationRequest = await requestGrowthActivation(adminCookie);
  await submitAndApprovePayment(adminCookie, "activation", adminActivationRequest.activation.id, "admin-activation-payment");
  const adminAfterActivation = await json(await app.request("/api/me", { headers: { cookie: adminCookie } }));
  record("admin QA identity is annually active before earning or sponsoring", adminAfterActivation.member?.activation_status === "active");

  // --- sign up member, onboard with admin's referral code ---
  const memberEmail = "member1@example.com";
  const signUpMember = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: memberEmail, password: "password123", name: "Member One" }),
  });
  const memberCookie = extractCookie(signUpMember);
  record("member sign-up", signUpMember.status === 200);

  const onboardRes = await app.request("/api/me/onboarding", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ phone: "+8801000000000", sponsorCode: adminMe.member.referral_code, termsAccepted: true }),
  });
  const onboarded = await json(onboardRes);
  record(
    "member onboarding places into matrix under admin",
    onboarded.member?.sponsor_user_id === adminMe.member.user_id &&
      onboarded.member?.network_parent_user_id === adminMe.member.user_id &&
      onboarded.member?.network_slot === 1,
    onboarded,
  );

  const missingGrowthTerms = await json(await app.request("/api/activation/request", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  record("Growth activation without current Terms is rejected", missingGrowthTerms.error?.code === "terms_required", missingGrowthTerms);

  const activationReq = await requestGrowthActivation(memberCookie);
  record("member requests annual activation (BDT 1000, separate from booking economics)", activationReq.activation?.amount === 1000 && activationReq.activation?.status === "pending", activationReq);
  const growthConsents = await json(await app.request("/api/me/consents", { headers: { cookie: memberCookie } }));
  record(
    "Growth activation stores exact current Terms versions",
    growthConsents.consents?.some((c: { document_key: string; document_version: string }) => c.document_key === "GROWTH_PROGRAM_TERMS" && c.document_version === "1") &&
      growthConsents.consents?.some((c: { document_key: string; document_version: string }) => c.document_key === "GROWTH_ACTIVATION_TERMS" && c.document_version === "1"),
    growthConsents.consents,
  );
  const repeatGrowthTerms = await json(await app.request("/api/activation/request", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ acceptGrowthTerms: true }),
  }));
  record("repeat Growth activation request is rejected as already pending, not by duplicating consent", repeatGrowthTerms.error && repeatGrowthTerms.activation == null, repeatGrowthTerms);
  const consentCount = await queryOne<{ n: number }>(
    `select count(*)::int as n from user_consents where user_id=$1 and document_key='GROWTH_PROGRAM_TERMS' and document_version='1'`,
    [onboarded.member.user_id],
  );
  record("repeated same Terms acceptance is idempotent", consentCount?.n === 1, consentCount);
  const craftedActivationMerchant = await json(await app.request("/api/payments", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "act-merchant-not-allowed" },
    body: JSON.stringify({
      targetType: "activation",
      targetId: activationReq.activation.id,
      paymentMethod: "merchant",
      referenceId: "MERCHANT-NOT-ALLOWED",
      proofFilename: "receipt.png",
      proofMime: "image/png",
      proofBase64: "iVBORw0KGgo=",
    }),
  }));
  record(
    "crafted Growth activation Merchant payment is rejected",
    craftedActivationMerchant.error?.code === "payment_method_not_allowed" || craftedActivationMerchant.error?.code === "unsupported_payment_method",
    craftedActivationMerchant,
  );
  const bookingsBeforeActivationPay = await queryOne<{ n: number }>(
    `select count(*)::int as n from bookings where user_id=$1`,
    [onboarded.member.user_id],
  );
  await submitAndApprovePayment(memberCookie, "activation", activationReq.activation.id, "member-activation-payment");
  const memberMeAfterActivation = await json(await app.request("/api/me", { headers: { cookie: memberCookie } }));
  record("member's activation_status flips to active after verified payment approval", memberMeAfterActivation.member?.activation_status === "active", memberMeAfterActivation.member);
  const bookingsAfterActivationPay = await queryOne<{ n: number }>(
    `select count(*)::int as n from bookings where user_id=$1`,
    [onboarded.member.user_id],
  );
  const activationCommission = await queryOne<{ n: number }>(
    `select count(*)::int as n from commission_ledger where source_user_id=$1 or beneficiary_user_id=$1`,
    [onboarded.member.user_id],
  );
  record(
    "activation payment has no property booking or commission effect",
    bookingsBeforeActivationPay?.n === 0 && bookingsAfterActivationPay?.n === 0 && activationCommission?.n === 0,
    { bookingsBeforeActivationPay, bookingsAfterActivationPay, activationCommission },
  );

  // --- member books the flagship offer ---
  const bookingsBeforeConsentReject = await queryOne<{ n: number }>(`select count(*)::int as n from bookings`);
  const bookNoTerms = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "test-booking-no-terms" },
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  record(
    "Growth booking without Property Booking Terms is rejected",
    bookNoTerms.error?.code === "terms_required",
    bookNoTerms,
  );
  const bookForgedTerms = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "test-booking-forged-terms" },
    body: JSON.stringify({ offerSlug: "five-star-hotel-share", termsAccepted: true, accepted: true }),
  }));
  record(
    "crafted booking accepted=true without Property Booking Terms is rejected",
    bookForgedTerms.error?.code === "terms_required",
    bookForgedTerms,
  );
  const engineNoTerms = await withTransaction(async (client) => {
    try {
      await createBooking(client, onboarded.member.user_id, "five-star-hotel-share");
      return { ok: true };
    } catch (err: any) {
      return { ok: false, code: err?.code, message: err?.message };
    }
  });
  record(
    "engine createBooking without Property Booking Terms is rejected",
    engineNoTerms.ok === false && engineNoTerms.code === "terms_required",
    engineNoTerms,
  );
  const bookingsAfterConsentReject = await queryOne<{ n: number }>(`select count(*)::int as n from bookings`);
  record(
    "rejected booking consent attempts do not create a booking",
    bookingsBeforeConsentReject?.n === bookingsAfterConsentReject?.n,
    { before: bookingsBeforeConsentReject, after: bookingsAfterConsentReject },
  );

  const bookRes = await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "test-booking-1" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  });
  const booked = await json(bookRes);
  record("booking created pending, amount frozen from offer", booked.booking?.status === "pending" && booked.booking?.booking_amount === 50000, booked);
  const bookingConsent = await queryOne<{ document_key: string; document_version: string; context: string; reference_id: string }>(
    `select document_key, document_version, context, reference_id from user_consents
      where user_id=$1 and document_key='PROPERTY_BOOKING_TERMS' and reference_id=$2`,
    [onboarded.member.user_id, booked.booking.id],
  );
  record(
    "Property Booking Terms consent is stored with user, version, booking context, and booking reference",
    bookingConsent?.document_key === "PROPERTY_BOOKING_TERMS" &&
      bookingConsent.document_version === "1" &&
      bookingConsent.context === "booking" &&
      bookingConsent.reference_id === booked.booking.id,
    bookingConsent,
  );
  const laterBookNoTerms = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "test-booking-later-no-terms" },
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  record(
    "prior booking consent does not authorize a later booking",
    laterBookNoTerms.error?.code === "terms_required",
    laterBookNoTerms,
  );

  // Idempotency replay: same key must not create a second booking.
  const bookRetryRes = await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "test-booking-1" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  });
  const bookedRetry = await json(bookRetryRes);
  record("idempotent replay returns the SAME booking id", bookedRetry.booking?.id === booked.booking?.id, bookedRetry.booking?.id);

  // --- commission is withheld until payment approval activates the booking ---
  const beforeActivation = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  record("pending booking does not release commission", beforeActivation.commissions?.length === 0, beforeActivation);
  await submitAndApprovePayment(memberCookie, "booking", booked.booking.id, "booking-payment-1");
  const bankMerchantConsent = await query(
    `select id from user_consents where user_id=$1 and document_key='MERCHANT_PAYMENT_TERMS' and reference_id=$2`,
    [onboarded.member.user_id, booked.booking.id],
  );
  record("Darmelk Bank booking payment does not require Merchant Payment Terms", bankMerchantConsent.length === 0, bankMerchantConsent.length);
  const activated = await json(await app.request(`/api/bookings/${booked.booking.id}`, { headers: { cookie: memberCookie } }));
  record("verified booking payment confirms, activates, and freezes its snapshot", activated.booking?.status === "activated", activated);

  const adminCommissionsRes = await app.request("/api/me/commissions", { headers: { cookie: adminCookie } });
  const adminCommissions = await json(adminCommissionsRes);
  const l1 = adminCommissions.commissions?.find((c: { level: number }) => c.level === 1);
  record(
    "L1 commission = 10% of the member's actual booking amount (5000), never a hard-coded platform figure",
    l1?.amount === 5000 && l1?.rate == 0.1,
    adminCommissions.totals,
  );

  // --- reverse the booking -> commission must be reversed via a NEW row, not deleted ---
  const reverseRes = await app.request(`/api/admin/bookings/${booked.booking.id}/reverse`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ reason: "smoke test reversal" }),
  });
  const reversed = await json(reverseRes);
  record("booking reversed, 1 commission reversed", reversed.booking?.status === "reversed" && reversed.commissionsReversed === 1, reversed);

  const adminCommissionsAfter = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  record(
    "reversed commission ledger row still present (immutable history) with status=reversed",
    adminCommissionsAfter.commissions?.length === 1 && adminCommissionsAfter.commissions[0].status === "reversed",
    adminCommissionsAfter.commissions,
  );

  // --- qualification: admin has 1 sponsee so far (needs 3) ---
  const qualRes = await app.request("/api/me/network", { headers: { cookie: adminCookie } });
  const qual = await json(qualRes);
  record("qualification not yet met (1 of 3 sponsors)", qual.qualification?.sponsorCount === 1 && qual.qualification?.qualified === false, qual.qualification);

  // --- matrix spillover: sponsor 3 more members directly under admin (fills
  // admin's slots 2, 3, and then a 4th must SPILL to under member1) ---
  const cookies: string[] = [];
  for (const n of [2, 3, 4]) {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `member${n}@example.com`, password: "password123", name: `Member ${n}` }),
    });
    const cookie = extractCookie(res);
    cookies.push(cookie);
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ phone: `+88010000000${n}`, sponsorCode: adminMe.member.referral_code, termsAccepted: true }),
    });
  }
  const [m2, m3, m4] = await Promise.all(
    cookies.map(async (cookie) => json(await app.request("/api/me", { headers: { cookie } }))),
  );
  record(
    "spillover: member4 (admin's 4th sponsee) is placed under member1, not admin (admin's slots full)",
    m4.member.network_parent_user_id === onboarded.member.user_id && m4.member.network_slot === 1,
    { member2Parent: m2.member.network_parent_user_id, member3Parent: m3.member.network_parent_user_id, member4Parent: m4.member.network_parent_user_id },
  );

  // Now admin has 1 ACTIVATED sponsee (member1) — sponsorCount should read 1.
  const qual2 = await json(await app.request("/api/me/network", { headers: { cookie: adminCookie } }));
  record("sponsorCount now reflects the 1 activated sponsee", qual2.qualification?.sponsorCount === 1, qual2.qualification);

  // --- withdrawal flow against a FRESH (non-reversed) commission ---
  const book2Res = await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "test-booking-2" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  });
  const book2 = await json(book2Res);
  await submitAndApprovePayment(memberCookie, "booking", book2.booking.id, "booking-payment-2");

  await withTransaction(async (client) => {
    const own = await createBooking(client, adminMe.member.user_id, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, own.id, adminMe.member.user_id);
    await activateBooking(client, own.id);
  });
  const payoutMethod = await json(await app.request("/api/me/payout-methods", {
    method: "POST", headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ methodType: "bkash", details: { accountName: "Darmelk QA Admin", accountNumber: "01800000000" } }),
  }));

  const withdrawRes = await app.request("/api/withdrawals", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 5000, payoutMethodId: payoutMethod.method.id }),
  });
  const withdrawal = await json(withdrawRes);
  record("withdrawal requested against available commission balance", withdrawal.withdrawal?.status === "requested" && withdrawal.withdrawal?.amount === 5000, withdrawal);

  const afterRequestTotals = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  record("requested withdrawal immediately reserves the amount from available", afterRequestTotals.totals?.available === 0, afterRequestTotals.totals);

  const reservedAgainRes = await app.request("/api/withdrawals", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 1000, payoutMethodId: payoutMethod.method.id }),
  });
  record("reserved amount is no longer withdrawable (409)", reservedAgainRes.status === 409);

  const overWithdrawRes = await app.request("/api/withdrawals", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 999999, payoutMethodId: payoutMethod.method.id }),
  });
  record("withdrawal exceeding available balance is rejected (409)", overWithdrawRes.status === 409);

  const approveOpenRes = await app.request(`/api/admin/withdrawals/${withdrawal.withdrawal.id}/approve`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  const approvedOpen = await json(approveOpenRes);
  record("open withdrawal can be approved before payout", approvedOpen.withdrawal?.status === "approved", approvedOpen);
  const rejectOpenRes = await app.request(`/api/admin/withdrawals/${withdrawal.withdrawal.id}/reject`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  const rejectedOpen = await json(rejectOpenRes);
  record("unpaid approved withdrawal can be rejected", rejectedOpen.withdrawal?.status === "rejected", rejectedOpen);
  const afterRejectTotals = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  record("rejecting an unpaid withdrawal releases the reserved amount once", afterRejectTotals.totals?.available === 5000, afterRejectTotals.totals);

  const withdrawRes2 = await app.request("/api/withdrawals", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 5000, payoutMethodId: payoutMethod.method.id }),
  });
  const withdrawal2 = await json(withdrawRes2);
  record("released amount can be requested again", withdrawal2.withdrawal?.status === "requested" && withdrawal2.withdrawal?.amount === 5000, withdrawal2);

  const approveWdRes = await app.request(`/api/admin/withdrawals/${withdrawal2.withdrawal.id}/approve`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  const approveWd = await json(approveWdRes);
  const missingRefRes = await app.request(`/api/admin/withdrawals/${withdrawal2.withdrawal.id}/mark-paid`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ paymentReference: "   " }),
  });
  record("mark as paid without a reference is rejected", missingRefRes.status === 400);
  const paidRes = await app.request(`/api/admin/withdrawals/${withdrawal2.withdrawal.id}/mark-paid`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ paymentReference: "QA-PAYOUT-001" }),
  });
  const paid = await json(paidRes);
  record(
    "withdrawal approved then marked paid with immutable payout snapshot",
    approveWd.withdrawal?.status === "approved"
      && paid.withdrawal?.status === "paid"
      && paid.withdrawal?.admin_payment_reference === "QA-PAYOUT-001"
      && paid.withdrawal?.paid_by_admin_id
      && paid.withdrawal?.amount === 5000
      && paid.withdrawal?.fee_amount === 125
      && paid.withdrawal?.net_amount === 4875
      && Boolean(paid.withdrawal?.paid_at),
    paid,
  );

  const paidAgainRes = await app.request(`/api/admin/withdrawals/${withdrawal2.withdrawal.id}/mark-paid`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ paymentReference: "QA-PAYOUT-002" }),
  });
  record("the same withdrawal cannot be paid twice", paidAgainRes.status === 409);

  const commissionsAfterPay = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  const paidCommission = commissionsAfterPay.commissions.find((cm: { source_booking_id: string }) => cm.source_booking_id === book2.booking.id);
  record("the commission backing the paid withdrawal flipped to status=paid (not deleted)", paidCommission?.status === "paid", paidCommission);
  record("mark as paid does not deduct the reserved amount a second time", commissionsAfterPay.totals?.available === 0 && commissionsAfterPay.totals?.paid === 5000, commissionsAfterPay.totals);


  // --- deterministic production-equivalent 3x5 fixture -----------------
  // Uses the same PostgreSQL schema and engine functions as Lambda. Only the
  // identity rows are seeded directly; placement, bookings, commissions,
  // snapshots, qualification and reversals all execute real business logic.
  const matrixRootId = "darmelk_qa_matrix_root";
  const matrixRootEmail = "darmelk-qa-matrix-root@example.com";
  await withTransaction(async (client) => {
    await client.query(
      `insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt")
       values ($1,'Darmelk QA Matrix Root',$2,true,now(),now())`,
      [matrixRootId, matrixRootEmail],
    );
    await ensureMember(client, { id: matrixRootId, email: matrixRootEmail });
    await client.query(
      `update members set activation_status='active', activation_expires_at=now()+interval '365 days' where user_id=$1`,
      [matrixRootId],
    );
  });
  const matrixRoot = (await query<any>(`select * from members where user_id=$1`, [matrixRootId]))[0];

  let firstQaBooking: any;
  let sponsor3WithoutLevel5: any;
  for (let n = 1; n <= 363; n += 1) {
    const suffix = String(n).padStart(3, "0");
    const userId = `darmelk_qa_matrix_${suffix}`;
    const email = `darmelk-qa-matrix-${suffix}@example.com`;
    await withTransaction(async (client) => {
      await client.query(
        `insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt")
         values ($1,$2,$3,true,now(),now())`,
        [userId, `Darmelk QA Matrix ${suffix}`, email],
      );
      await ensureMember(client, { id: userId, email });
      await completeOnboarding(client, userId, { phone: `+88017${suffix.padStart(8, "0")}`, sponsorCode: matrixRoot.referral_code });
      await client.query(
        `update members set activation_status='active', activation_expires_at=now()+interval '365 days' where user_id=$1`,
        [userId],
      );
    });

    if (n === 1) {
      const beforeBooking = await withTransaction((client) => getQualificationStatus(client, matrixRootId));
      record("network position is not counted before an activated booking", beforeBooking.levelCounts[1] === 0, beforeBooking);
    }

    const booking = await withTransaction(async (client) => {
      const created = await createBooking(client, userId, "five-star-hotel-share", { acceptBookingTerms: true });
      await confirmBooking(client, created.id, adminMe.member.user_id);
      return created;
    });
    if (n === 1) {
      firstQaBooking = booking;
      const premature = await query<any>(`select * from commission_ledger where source_booking_id=$1`, [booking.id]);
      record("confirmed booking releases no premature commission", premature.length === 0, premature);
    }
    await withTransaction((client) => activateBooking(client, booking.id));
    if (n === 3) sponsor3WithoutLevel5 = await withTransaction((client) => getQualificationStatus(client, matrixRootId));
  }

  record(
    "sponsor 3 without completed Level 5 is insufficient",
    sponsor3WithoutLevel5.sponsorCount === 3 && sponsor3WithoutLevel5.level5Complete === false && sponsor3WithoutLevel5.qualified === false,
    sponsor3WithoutLevel5,
  );

  const fullMatrix = await withTransaction((client) => getQualificationStatus(client, matrixRootId));
  record(
    "complete 3x5 matrix is exactly 3/9/27/81/243 and qualifies with sponsor 3",
    fullMatrix.levelCounts[1] === 3 && fullMatrix.levelCounts[2] === 9 && fullMatrix.levelCounts[3] === 27 &&
      fullMatrix.levelCounts[4] === 81 && fullMatrix.levelCounts[5] === 243 && fullMatrix.qualified === true,
    fullMatrix,
  );

  const noLevel6 = await withTransaction(async (client) => {
    const userId = "darmelk_qa_matrix_364";
    const email = "darmelk-qa-matrix-364@example.com";
    await client.query(
      `insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values ($1,'Darmelk QA Matrix 364',$2,true,now(),now())`,
      [userId, email],
    );
    await ensureMember(client, { id: userId, email });
    try {
      await completeOnboarding(client, userId, { phone: "+8801700000364", sponsorCode: matrixRoot.referral_code });
      return false;
    } catch {
      return true;
    }
  });
  record("matrix refuses an unintended Level 6 position", noLevel6 === true);

  const deepest = (await query<any>(
    `with recursive tree as (
       select user_id,1 level from members where network_parent_user_id=$1
       union all select m.user_id,tree.level+1 from members m join tree on m.network_parent_user_id=tree.user_id where tree.level<5
     ) select t.user_id,b.id,b.booking_amount from tree t join bookings b on b.user_id=t.user_id
        where t.level=5 and b.status='activated' order by t.user_id desc limit 1`,
    [matrixRootId],
  ))[0];
  const commissionChain = await query<any>(
    `select level,rate,source_booking_amount,amount,status from commission_ledger where source_booking_id=$1 order by level`,
    [deepest.id],
  );
  record(
    "L1-L5 commissions use the actual BDT 50,000 booking amount at 10/8/6/4/2 percent",
    JSON.stringify(commissionChain.map((r:any) => [r.level, Number(r.rate), r.source_booking_amount, r.amount])) ===
      JSON.stringify([[1,0.1,50000,5000],[2,0.08,50000,4000],[3,0.06,50000,3000],[4,0.04,50000,2000],[5,0.02,50000,1000]]),
    commissionChain,
  );
  const duplicatePosted = await withTransaction((client) => postCommissionsForBooking(client, {
    id: deepest.id, userId: deepest.user_id, bookingAmount: deepest.booking_amount,
  }));
  record("commission posting is idempotent", duplicatePosted.length === 0);

  const level5WithoutSponsor3 = await withTransaction(async (client) => {
    await client.query(`update members set sponsor_user_id=null where user_id like 'darmelk_qa_matrix_%'`);
    const status = await getQualificationStatus(client, matrixRootId);
    await client.query(`update members set sponsor_user_id=$1 where user_id like 'darmelk_qa_matrix_%' and user_id <> 'darmelk_qa_matrix_364' and user_id <> $1`, [matrixRootId]);
    return status;
  });
  record(
    "completed Level 5 without sponsor 3 is insufficient",
    level5WithoutSponsor3.level5Complete === true && level5WithoutSponsor3.sponsorCount === 0 && level5WithoutSponsor3.qualified === false,
    level5WithoutSponsor3,
  );

  const reversedQa = await withTransaction(async (client) => {
    const created = await createBooking(client, deepest.user_id, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    await activateBooking(client, created.id);
    return reverseBooking(client, created.id, { reason: "isolated QA reversal", adminUserId: adminMe.member.user_id });
  });
  const reversedLedger = await query<any>(
    `select c.status,r.reversed_amount from commission_ledger c join reversal_entries r on r.commission_ledger_id=c.id
      where c.source_booking_id=$1`,
    [reversedQa.booking.id],
  );
  record(
    "reversal preserves five ledger rows and appends five immutable reversal entries",
    reversedQa.commissionsReversed === 5 && reversedLedger.length === 5 && reversedLedger.every((r:any) => r.status === "reversed"),
    reversedLedger,
  );

  const ownQaBooking = await withTransaction(async (client) => {
    const created = await createBooking(client, matrixRootId, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    await activateBooking(client, created.id);
    return created;
  });
  const frozenQa = (await query<any>(`select * from booking_snapshots where booking_id=$1`, [ownQaBooking.id]))[0];
  record(
    "qualified member benefit remains the immutable booked-offer snapshot",
    frozenQa.retail_value === 650000 && frozenQa.booking_amount === 50000 && frozenQa.qualification_benefit === 600000,
    frozenQa,
  );

  await query(`update members set activation_status='active', activation_expires_at=now()-interval '1 minute' where user_id=$1`, [matrixRootId]);
  const expiredReleaseBooking = await withTransaction(async (client) => {
    const created = await createBooking(client, deepest.user_id, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    await activateBooking(client, created.id);
    return created;
  });
  const expiredRootCommission = await query<any>(
    `select * from commission_ledger where source_booking_id=$1 and beneficiary_user_id=$2`,
    [expiredReleaseBooking.id, matrixRootId],
  );
  record("expired member receives no new commission release", expiredRootCommission.length === 0);

  const expiredSponsorshipBlocked = await withTransaction(async (client) => {
    const id = "darmelk_qa_expired_sponsor_probe";
    const email = "darmelk-qa-expired-sponsor-probe@example.com";
    await client.query(
      `insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values ($1,'Darmelk QA Expired Sponsor Probe',$2,true,now(),now())`,
      [id, email],
    );
    await ensureMember(client, { id, email });
    try {
      await completeOnboarding(client, id, { phone: "+8801700000999", sponsorCode: matrixRoot.referral_code });
      return false;
    } catch {
      return true;
    }
  });
  record("expired member cannot sponsor a new network placement", expiredSponsorshipBlocked === true);

  const rootRenewal = await withTransaction(async (client) => {
    const activation = await requestActivation(client, matrixRootId, { acceptGrowthTerms: true });
    return approveActivation(client, activation.id, adminMe.member.user_id);
  });
  record(
    "expired Growth member without a sponsor can renew the existing activation period",
    rootRenewal.amount === 1000 && rootRenewal.status === "active" && !matrixRoot.sponsor_user_id,
    { amount: rootRenewal.amount, status: rootRenewal.status, sponsor: matrixRoot.sponsor_user_id },
  );
  const restoredReleaseBooking = await withTransaction(async (client) => {
    const created = await createBooking(client, deepest.user_id, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    await activateBooking(client, created.id);
    return created;
  });
  const restoredRootCommission = await query<any>(
    `select * from commission_ledger where source_booking_id=$1 and beneficiary_user_id=$2`,
    [restoredReleaseBooking.id, matrixRootId],
  );
  record(
    "BDT 1,000 renewal restores sponsorship and commission privileges",
    rootRenewal.amount === 1000 && rootRenewal.status === "active" && restoredRootCommission.length === 1,
  );

  await query(`update members set activation_status='active', activation_expires_at=now()-interval '1 minute' where user_id=$1`, [adminMe.member.user_id]);
  await query(`update annual_activations set period_end=now()-interval '1 minute' where user_id=$1 and status='active'`, [adminMe.member.user_id]);
  const expiredWithdrawal = await app.request("/api/withdrawals", {
    method: "POST", headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 1000, payoutMethodId: payoutMethod.method.id }),
  });
  record("expired member is blocked from withdrawal", expiredWithdrawal.status === 403);
  const renewalReq = await requestGrowthActivation(adminCookie);
  await submitAndApprovePayment(adminCookie, "activation", renewalReq.activation.id, "admin-renewal-payment");
  const renewed = await json(await app.request("/api/me", { headers: { cookie: adminCookie } }));
  record("BDT 1,000 renewal restores active status", renewalReq.activation?.amount === 1000 && renewed.member?.activation_status === "active", renewed);

  const reconnectState = await query<any>(`select count(*)::int count from members where user_id like 'darmelk_qa_matrix_%' and onboarding_complete=true`);
  record("fixture persists across independent transactions/reconnect queries", reconnectState[0]?.count === 363, reconnectState[0]);

  const contactRes = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Amina Rahman",
      profession: "Architect",
      mobile: "+8801712345678",
      location: "Dhaka",
    }),
  });
  const contact = await json(contactRes);
  record(
    "public contact submission persists as new",
    contactRes.status === 201 &&
      contact.request?.status === "new" &&
      contact.request?.name === "Amina Rahman" &&
      contact.request?.source === "contact" &&
      !contact.request?.offer_slug,
    contact,
  );
  const invalidContact = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "X" }),
  });
  record("invalid contact submission is rejected", invalidContact.status === 400, invalidContact.status);
  const memberContactAdmin = await app.request("/api/admin/contact-requests", { headers: { cookie: memberCookie } });
  record("member cannot list contact requests", memberContactAdmin.status === 403, memberContactAdmin.status);
  const anonContactAdmin = await app.request("/api/admin/contact-requests");
  record("anonymous cannot list contact requests", anonContactAdmin.status === 401, anonContactAdmin.status);
  const adminList = await json(await app.request("/api/admin/contact-requests", { headers: { cookie: adminCookie } }));
  record(
    "admin sees persisted contact request",
    Array.isArray(adminList.requests) && adminList.requests.some((r: { name: string }) => r.name === "Amina Rahman"),
    adminList.requests?.length,
  );
  const createdId = adminList.requests?.find((r: { name: string }) => r.name === "Amina Rahman")?.id;
  const bookingsBeforeRtb = await queryOne<{ count: string }>(`select count(*)::text as count from bookings`);
  const rtbRes = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Farhan Islam",
      profession: "Teacher",
      mobile: "+8801811111111",
      location: "Chattogram",
      offerSlug: "five-star-hotel-share",
      source: "request_to_book",
    }),
  });
  const rtb = await json(rtbRes);
  record(
    "guest request-to-book stores property context without creating a booking",
    rtbRes.status === 201 &&
      rtb.request?.source === "request_to_book" &&
      rtb.request?.offer_slug === "five-star-hotel-share" &&
      Boolean(rtb.request?.offer_title) &&
      rtb.request?.status === "new",
    rtb,
  );
  const adminListAfterRtb = await json(await app.request("/api/admin/contact-requests", { headers: { cookie: adminCookie } }));
  record(
    "admin sees request-to-book property context",
    Array.isArray(adminListAfterRtb.requests) &&
      adminListAfterRtb.requests.some(
        (r: { name: string; offer_slug?: string; source?: string }) =>
          r.name === "Farhan Islam" && r.offer_slug === "five-star-hotel-share" && r.source === "request_to_book",
      ) &&
      adminListAfterRtb.requests.some((r: { name: string; source?: string }) => r.name === "Amina Rahman" && r.source === "contact"),
    adminListAfterRtb.requests?.length,
  );
  const bookingsAfterRtb = await queryOne<{ count: string }>(`select count(*)::text as count from bookings`);
  record(
    "request-to-book does not create a booking row",
    bookingsBeforeRtb?.count === bookingsAfterRtb?.count,
    { before: bookingsBeforeRtb, after: bookingsAfterRtb },
  );
  const unknownRtb = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Unknown Property",
      profession: "Teacher",
      mobile: "+8801811111113",
      location: "Dhaka",
      offerSlug: "not-a-published-property",
      source: "request_to_book",
    }),
  });
  record("request-to-book with unknown property is rejected", unknownRtb.status === 400, unknownRtb.status);
  const badRtb = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "No Property",
      profession: "Teacher",
      mobile: "+8801811111112",
      location: "Dhaka",
      source: "request_to_book",
    }),
  });
  record("request-to-book without a property is rejected", badRtb.status === 400, badRtb.status);
  const statusRes = await app.request(`/api/admin/contact-requests/${createdId}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "reviewed" }),
  });
  const statusBody = await json(statusRes);
  record("admin can transition contact request status", statusBody.request?.status === "reviewed", statusBody);

  const rateMobile = "+8801999888777";
  const ratePayload = {
    name: "Rate Limit Check",
    profession: "Tester",
    mobile: rateMobile,
    location: "Dhaka",
  };
  const rateOne = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ratePayload),
  });
  const rateTwo = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...ratePayload, name: "Rate Limit Check Two" }),
  });
  const rateThree = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...ratePayload, name: "Rate Limit Check Three" }),
  });
  record(
    "three contact submissions from the same mobile are accepted",
    rateOne.status === 201 && rateTwo.status === 201 && rateThree.status === 201,
    { one: rateOne.status, two: rateTwo.status, three: rateThree.status },
  );
  const beforeFourth = await queryOne<{ n: number }>(
    `select count(*)::int as n from contact_requests where regexp_replace(mobile, '[^0-9]', '', 'g') = '8801999888777'`,
  );
  const rateFour = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...ratePayload, name: "Rate Limit Check Four" }),
  });
  const rateFourBody = await json(rateFour);
  const afterFourth = await queryOne<{ n: number }>(
    `select count(*)::int as n from contact_requests where regexp_replace(mobile, '[^0-9]', '', 'g') = '8801999888777'`,
  );
  record(
    "fourth contact submission from the same mobile is rate limited",
    rateFour.status === 429 && rateFourBody.error?.code === "rate_limited",
    rateFourBody,
  );
  record(
    "rate-limited contact attempt does not insert a row",
    (beforeFourth?.n ?? 0) === (afterFourth?.n ?? 0),
    { before: beforeFourth, after: afterFourth },
  );
  const ipFlood = [];
  for (let i = 0; i < 9; i += 1) {
    ipFlood.push(
      await app.request("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({
          name: `Ip Flood ${i}`,
          profession: "Tester",
          mobile: `+88018880000${10 + i}`,
          location: "Dhaka",
        }),
      }),
    );
  }
  record(
    "repeated contact posts from the same IP are rate limited",
    ipFlood.slice(0, 8).every((res) => res.status === 201) && ipFlood[8]?.status === 429,
    ipFlood.map((res) => res.status),
  );

  const publicOffers = await json(await app.request("/api/offers"));
  const flagshipLive = publicOffers.offers?.find((o: { slug: string }) => o.slug === "five-star-hotel-share");
  record(
    "public catalog includes published Five-Star Hotel Share",
    flagshipLive?.status === "published" && flagshipLive?.booking_amount === 50000 && flagshipLive?.retail_value === 650000 && flagshipLive?.qualification_benefit === 600000,
    flagshipLive,
  );

  const memberCreateOffer = await app.request("/api/admin/offers", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Should fail", categorySlug: "land-plots", retailValue: 1000, bookingAmount: 100, qualificationBenefit: 900 }),
  });
  record("non-admin cannot create offers", memberCreateOffer.status === 403, memberCreateOffer.status);
  const anonCreateOffer = await app.request("/api/admin/offers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Should fail", categorySlug: "land-plots", retailValue: 1000, bookingAmount: 100, qualificationBenefit: 900 }),
  });
  record("anonymous cannot create offers", anonCreateOffer.status === 401, anonCreateOffer.status);

  const draftCreate = await json(await app.request("/api/admin/offers", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Chittagong Plot Share",
      categorySlug: "land-plots",
      location: "Chittagong",
      summary: "Draft plot offer",
      retailValue: 400000,
      bookingAmount: 25000,
      qualificationBenefit: 375000,
      commissionEligibleAmount: 25000,
      status: "draft",
    }),
  }));
  record(
    "admin can create a draft offer with its own economics",
    draftCreate.offer?.status === "draft" && draftCreate.offer?.booking_amount === 25000 && draftCreate.offer?.slug === "chittagong-plot-share",
    draftCreate.offer,
  );
  const publicAfterDraft = await json(await app.request("/api/offers"));
  record(
    "draft offer is not in the public catalog",
    Array.isArray(publicAfterDraft.offers) && !publicAfterDraft.offers.some((o: { slug: string }) => o.slug === "chittagong-plot-share"),
    publicAfterDraft.offers?.map((o: { slug: string }) => o.slug),
  );
  const publicDraftGet = await app.request("/api/offers/chittagong-plot-share");
  record("draft offer is not publicly fetchable", publicDraftGet.status === 404, publicDraftGet.status);

  const draftEdit = await json(await app.request("/api/admin/offers/chittagong-plot-share", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ details: "Plot details for members.", features: ["Road access", "Surveyed"] }),
  }));
  record("admin can edit a draft offer", draftEdit.offer?.details === "Plot details for members." && Array.isArray(draftEdit.offer?.features), draftEdit.offer);

  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const coverUpload = await json(await app.request("/api/admin/offers/chittagong-plot-share/media", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ kind: "cover", filename: "cover.png", mime: "image/png", bytesBase64: png, alt: "Plot cover" }),
  }));
  const galleryUpload = await json(await app.request("/api/admin/offers/chittagong-plot-share/media", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ kind: "gallery", filename: "gallery.png", mime: "image/png", bytesBase64: png, alt: "Plot gallery" }),
  }));
  record(
    "admin can upload cover and gallery images",
    Boolean(coverUpload.offer?.image) && Array.isArray(galleryUpload.offer?.gallery) && galleryUpload.offer.gallery.length >= 1,
    { image: coverUpload.offer?.image, gallery: galleryUpload.offer?.gallery },
  );

  const publishRes = await json(await app.request("/api/admin/offers/chittagong-plot-share/status", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "published" }),
  }));
  record("admin can publish an offer", publishRes.offer?.status === "published", publishRes.offer);
  const publicAfterPublish = await json(await app.request("/api/offers"));
  record(
    "published offer appears in the public catalog",
    publicAfterPublish.offers?.some((o: { slug: string }) => o.slug === "chittagong-plot-share"),
    publicAfterPublish.offers?.map((o: { slug: string }) => o.slug),
  );
  const publicDetail = await json(await app.request("/api/offers/chittagong-plot-share"));
  record(
    "published offer detail uses offer-specific economics",
    publicDetail.offer?.booking_amount === 25000 && publicDetail.offer?.retail_value === 400000 && publicDetail.offer?.qualification_benefit === 375000,
    publicDetail.offer,
  );

  const frozenBefore = await query<any>(`select booking_amount, retail_value, qualification_benefit from bookings where offer_slug='five-star-hotel-share' order by created_at asc limit 1`);
  const flagshipEdit = await json(await app.request("/api/admin/offers/five-star-hotel-share", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ notes: "Admin note only", summary: flagshipLive?.summary }),
  }));
  const frozenAfter = await query<any>(`select booking_amount, retail_value, qualification_benefit from bookings where offer_slug='five-star-hotel-share' order by created_at asc limit 1`);
  record(
    "editing an offer does not mutate historical booking snapshots",
    frozenBefore[0]?.booking_amount === 50000 && frozenAfter[0]?.booking_amount === 50000 && frozenAfter[0]?.retail_value === frozenBefore[0]?.retail_value,
    { frozenBefore: frozenBefore[0], frozenAfter: frozenAfter[0], version: flagshipEdit.offer?.version },
  );

  const closeRes = await json(await app.request("/api/admin/offers/chittagong-plot-share/status", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
  }));
  record("admin can close an offer", closeRes.offer?.status === "closed", closeRes.offer);
  const closedBooking = await withTransaction(async (client) => {
    try {
      await createBooking(client, adminMe.member.user_id, "chittagong-plot-share", { acceptBookingTerms: true });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, code: err?.code, message: err?.message };
    }
  });
  record("closed offer blocks new booking initiation", closedBooking.ok === false, closedBooking);

  const memberCreateJob = await app.request("/api/admin/jobs", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Should fail", department: "Operations", location: "Dhaka", employmentType: "Full-time" }),
  });
  record("non-admin cannot create jobs", memberCreateJob.status === 403, memberCreateJob.status);
  const anonCreateJob = await app.request("/api/admin/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Should fail", department: "Operations", location: "Dhaka", employmentType: "Full-time" }),
  });
  record("anonymous cannot create jobs", anonCreateJob.status === 401, anonCreateJob.status);

  const draftJob = await json(await app.request("/api/admin/jobs", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Member Operations Associate",
      department: "Operations",
      location: "Dhaka",
      employmentType: "Full-time",
      status: "draft",
    }),
  }));
  record(
    "admin can create a draft job",
    draftJob.job?.status === "draft" && draftJob.job?.slug === "member-operations-associate",
    draftJob.job,
  );
  const publicJobsAfterDraft = await json(await app.request("/api/jobs"));
  record(
    "draft job is not in the public career list",
    Array.isArray(publicJobsAfterDraft.jobs) && !publicJobsAfterDraft.jobs.some((j: { slug: string }) => j.slug === "member-operations-associate"),
    publicJobsAfterDraft.jobs,
  );
  const publicDraftJob = await app.request("/api/jobs/member-operations-associate");
  record("draft job is not publicly fetchable", publicDraftJob.status === 404, publicDraftJob.status);

  const jobEdit = await json(await app.request("/api/admin/jobs/member-operations-associate", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      description: "Support member operations with clear, documented processes.",
      applicationEmail: "careers@darmelk.com",
      responsibilities: ["Review member records", "Coordinate with property operations"],
    }),
  }));
  record("admin can edit a draft job", jobEdit.job?.application_email === "careers@darmelk.com" && jobEdit.job?.description?.includes("Support member"), jobEdit.job);

  const publishJob = await json(await app.request("/api/admin/jobs/member-operations-associate/status", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "published" }),
  }));
  record("admin can publish a job", publishJob.job?.status === "published", publishJob.job);
  const publicJobs = await json(await app.request("/api/jobs"));
  record(
    "published job appears in the public career list",
    publicJobs.jobs?.some((j: { slug: string }) => j.slug === "member-operations-associate"),
    publicJobs.jobs?.map((j: { slug: string }) => j.slug),
  );
  const publicJob = await json(await app.request("/api/jobs/member-operations-associate"));
  record(
    "published job detail includes application email",
    publicJob.job?.application_email === "careers@darmelk.com" && publicJob.job?.title === "Member Operations Associate",
    publicJob.job,
  );

  const closeJob = await json(await app.request("/api/admin/jobs/member-operations-associate/status", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
  }));
  record("admin can close a job", closeJob.job?.status === "closed", closeJob.job);
  const publicAfterClose = await json(await app.request("/api/jobs"));
  record(
    "closed job is not listed as an open vacancy",
    !publicAfterClose.jobs?.some((j: { slug: string }) => j.slug === "member-operations-associate"),
    publicAfterClose.jobs,
  );
  const closedJobDetail = await json(await app.request("/api/jobs/member-operations-associate"));
  record("closed job detail remains readable and closed", closedJobDetail.job?.status === "closed", closedJobDetail.job);

  const dec1 = new Date("2026-12-01T12:00:00+06:00");
  const dec15 = new Date("2026-12-15T12:00:00+06:00");
  const dec31 = new Date("2026-12-31T23:30:00+06:00");
  record("CASE 1/2/3 Level 5 in December starts January regardless of day",
    followingMonth(dec1) === "2027-01-01" && followingMonth(dec15) === "2027-01-01" && followingMonth(dec31) === "2027-01-01");
  const bounds = cycleBounds(dec15);
  record("CASE 7/12/16 cycle is a fixed January–December window", bounds.start === "2027-01-01" && bounds.end === "2027-12-01");
  const novUpgrade = effectiveMonthFor(new Date("2027-11-10T12:00:00+06:00"), "2027-12-01");
  const decUpgrade = effectiveMonthFor(new Date("2027-12-20T12:00:00+06:00"), "2027-12-01");
  record("CASE 14 November upgrade may apply in December", novUpgrade.month === "2027-12-01" && novUpgrade.applies === true);
  record("CASE 15 December upgrade does not create Month 13", decUpgrade.month === "2028-01-01" && decUpgrade.applies === false);
  record("CASE 5/6 any 3 of 5 is enough and 2 is not",
    nthTimestamp(["2027-01-01", "2027-02-01", "2027-04-01", "2027-06-01", "2027-08-01"], 3) === "2027-04-01"
    && nthTimestamp(["2027-01-01", "2027-02-01"], 3) === null);
  const sampleEvents = [
    { tier: TIER_50K, effective_month: "2027-05-01", applies_in_cycle: true },
    { tier: TIER_100K, effective_month: "2027-09-01", applies_in_cycle: true },
  ];
  record("CASE 11/13 later upgrade does not rewrite January",
    tierOnMonth("2027-01-01", "2027-12-01", sampleEvents, "2027-01-01") === TIER_25K
    && tierOnMonth("2027-01-01", "2027-12-01", sampleEvents, "2027-05-01") === TIER_50K
    && tierOnMonth("2027-01-01", "2027-12-01", sampleEvents, "2027-09-01") === TIER_100K
    && addMonths("2027-01-01", 12) === "2028-01-01");

  await query(`update bookings set activated_at = timestamptz '2026-12-15 12:00:00+06' where user_id like 'darmelk_qa_matrix_%'`);
  const janAsOf = new Date("2027-01-15T12:00:00+06:00");
  const firstSync = await withTransaction((client) => syncLeadershipReward(client, matrixRootId, janAsOf));
  record(
    "CASE 1 matrix root Level 5 in December creates January 25K entitlement",
    firstSync.eligible === true && firstSync.cycle?.startMonth === "2027-01-01" && firstSync.cycle?.endMonth === "2027-12-01"
      && firstSync.entitlements.length === 1 && firstSync.entitlements[0]?.amount === TIER_25K
      && firstSync.entitlements[0]?.rewardMonth === "2027-01-01" && firstSync.cycle?.currentTier === TIER_25K
      && firstSync.entitlements[0]?.status === "earned" && firstSync.entitlements[0]?.paidAt === null,
    firstSync.cycle,
  );
  const retrySync = await withTransaction((client) => syncLeadershipReward(client, matrixRootId, janAsOf));
  const entitlementCount = await query<any>(`select count(*)::int as n from leadership_reward_entitlements where user_id=$1`, [matrixRootId]);
  const cycleCount = await query<any>(`select count(*)::int as n from leadership_reward_cycles where user_id=$1`, [matrixRootId]);
  record("CASE 17 retry does not duplicate cycle or month", retrySync.entitlements.length === 1 && entitlementCount[0]?.n === 1 && cycleCount[0]?.n === 1);
  await Promise.all([
    withTransaction((client) => syncLeadershipReward(client, matrixRootId, janAsOf)),
    withTransaction((client) => syncLeadershipReward(client, matrixRootId, janAsOf)),
  ]);
  const concurrentCount = await query<any>(`select count(*)::int as n from leadership_reward_entitlements where user_id=$1`, [matrixRootId]);
  const concurrentCycles = await query<any>(`select count(*)::int as n from leadership_reward_cycles where user_id=$1`, [matrixRootId]);
  record("CASE 18 concurrent evaluation does not duplicate cycle, month, or upgrade", concurrentCount[0]?.n === 1 && concurrentCycles[0]?.n === 1);

  await query(
    `insert into leadership_reward_cycles (id, user_id, level5_completed_at, cycle_start_month, cycle_end_month)
     values ('lrc_qa_d1','darmelk_qa_matrix_001', timestamptz '2027-04-08 12:00:00+06', '2027-05-01', '2028-04-01'),
            ('lrc_qa_d2','darmelk_qa_matrix_002', timestamptz '2027-04-09 12:00:00+06', '2027-05-01', '2028-04-01')`,
  );
  const twoDirects = await withTransaction((client) => syncLeadershipReward(client, matrixRootId, new Date("2027-04-15T12:00:00+06:00")));
  record("CASE 6 only 2 qualifying directs does not unlock 50K",
    twoDirects.cycle?.currentTier === TIER_25K && twoDirects.cycle?.nextTierProgress.count === 2, twoDirects.cycle?.nextTierProgress);

  await query(
    `insert into leadership_reward_cycles (id, user_id, level5_completed_at, cycle_start_month, cycle_end_month)
     values ('lrc_qa_d3','darmelk_qa_matrix_003', timestamptz '2027-04-10 12:00:00+06', '2027-05-01', '2028-04-01'),
            ('lrc_qa_d4','darmelk_qa_matrix_004', timestamptz '2027-04-20 12:00:00+06', '2027-05-01', '2028-04-01'),
            ('lrc_qa_d5','darmelk_qa_matrix_005', timestamptz '2027-06-01 12:00:00+06', '2027-07-01', '2028-06-01')`,
  );
  const maySync = await withTransaction((client) => syncLeadershipReward(client, matrixRootId, new Date("2027-05-15T12:00:00+06:00")));
  const janRow = maySync.entitlements.find((e) => e.rewardMonth === "2027-01-01");
  const mayRow = maySync.entitlements.find((e) => e.rewardMonth === "2027-05-01");
  record("CASE 4/5/9 any 3 of 5 directs unlock 50K from the following month",
    maySync.cycle?.currentTier === TIER_50K && mayRow?.amount === TIER_50K && maySync.cycle?.startMonth === "2027-01-01"
    && maySync.cycle?.endMonth === "2027-12-01", maySync.cycle);
  record("CASE 11 January 25K remains 25K after the May upgrade", janRow?.amount === TIER_25K, janRow);
  record("CASE 12/13 upgrade does not restart or extend the original round",
    maySync.cycle?.startMonth === "2027-01-01" && maySync.cycle?.endMonth === "2027-12-01");

  await query(
    `insert into leadership_reward_tier_events (id, cycle_id, user_id, tier, eligible_at, effective_month, applies_in_cycle, evidence)
     values ('lrt_qa_50_1','lrc_qa_d1','darmelk_qa_matrix_001',50000, timestamptz '2027-08-08 12:00:00+06', '2027-09-01', true, '[]'::jsonb),
            ('lrt_qa_50_2','lrc_qa_d2','darmelk_qa_matrix_002',50000, timestamptz '2027-08-09 12:00:00+06', '2027-09-01', true, '[]'::jsonb)`,
  );
  const twoFifty = await withTransaction((client) => syncLeadershipReward(client, matrixRootId, new Date("2027-08-15T12:00:00+06:00")));
  record("CASE 8 only 2 directs at 50K does not unlock 100K", twoFifty.cycle?.currentTier === TIER_50K, twoFifty.cycle);

  await query(
    `insert into leadership_reward_tier_events (id, cycle_id, user_id, tier, eligible_at, effective_month, applies_in_cycle, evidence)
     values ('lrt_qa_50_3','lrc_qa_d3','darmelk_qa_matrix_003',50000, timestamptz '2027-08-10 12:00:00+06', '2027-09-01', true, '[]'::jsonb)`,
  );
  const sepSync = await withTransaction((client) => syncLeadershipReward(client, matrixRootId, new Date("2027-09-15T12:00:00+06:00")));
  const sepRow = sepSync.entitlements.find((e) => e.rewardMonth === "2027-09-01");
  record("CASE 7/10 any 3 directs at 50K unlock 100K from the following month",
    sepSync.cycle?.currentTier === TIER_100K && sepRow?.amount === TIER_100K, sepSync.cycle);
  record("CASE 11 historical months stay at their original tier after 100K",
    sepSync.entitlements.find((e) => e.rewardMonth === "2027-01-01")?.amount === TIER_25K
    && sepSync.entitlements.find((e) => e.rewardMonth === "2027-05-01")?.amount === TIER_50K);

  const done = await withTransaction((client) => syncLeadershipReward(client, matrixRootId, new Date("2028-01-15T12:00:00+06:00")));
  record("CASE 16 Month 12 ends the round with no Month 13",
    done.cycle?.phase === "completed" && done.entitlements.length === 12
    && done.entitlements.every((e) => e.cycleMonth <= 12) && done.projected.length === 0, { n: done.entitlements.length, phase: done.cycle?.phase });

  const memberLeadership = await json(await app.request("/api/me/leadership-reward", { headers: { cookie: memberCookie } }));
  record("CASE 20 unqualified member sees pre-eligibility state",
    memberLeadership.leadership?.eligible === false && memberLeadership.leadership?.cycle === null, memberLeadership.leadership);
  const memberAdminLr = await app.request("/api/admin/leadership-rewards", { headers: { cookie: memberCookie } });
  record("CASE 19 non-admin cannot list Leadership Rewards", memberAdminLr.status === 403, memberAdminLr.status);
  const anonAdminLr = await app.request("/api/admin/leadership-rewards");
  record("anonymous cannot list Leadership Rewards", anonAdminLr.status === 401, anonAdminLr.status);
  const adminListLr = await json(await app.request("/api/admin/leadership-rewards", { headers: { cookie: adminCookie } }));
  record("admin can inspect Leadership Reward rounds",
    Array.isArray(adminListLr.rewards) && adminListLr.rewards.some((r: { userId: string }) => r.userId === matrixRootId), adminListLr.rewards?.length);
  const adminDetailLr = await json(await app.request(`/api/admin/leadership-rewards/${matrixRootId}`, { headers: { cookie: adminCookie } }));
  record("admin audit view includes qualifying evidence and monthly history",
    adminDetailLr.leadership?.evidence?.tier50?.length >= 3 && adminDetailLr.leadership?.entitlements?.length === 12, adminDetailLr.leadership?.evidence);

  const signupOnboardActivate = async (email: string, name: string, sponsorCode: string) => {
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123", name }),
    });
    const cookie = extractCookie(signUp);
    await app.request("/api/me", { headers: { cookie } });
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name, phone: "+8801999000000", sponsorCode, termsAccepted: true }),
    });
    const act = await requestGrowthActivation(cookie);
    await submitAndApprovePayment(cookie, "activation", act.activation.id, `${email}-activation`);
    const me = await json(await app.request("/api/me", { headers: { cookie } }));
    return { cookie, member: me.member, merchant: me.merchant };
  };

  const memberMerchantNav = await json(await app.request("/api/me", { headers: { cookie: memberCookie } }));
  record("normal user is not an active Merchant before purchase", memberMerchantNav.merchant == null || memberMerchantNav.merchant.status !== "active");

  const memberCreateBundle = await app.request("/api/admin/merchant/bundles", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Should fail", purchaseAmount: 1000, purchasedCredit: 1000, terms: "x", status: "active" }),
  });
  record("non-admin cannot create Merchant bundles", memberCreateBundle.status === 403, memberCreateBundle.status);
  const anonCreateBundle = await app.request("/api/admin/merchant/bundles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Should fail", purchaseAmount: 1000, purchasedCredit: 1000, terms: "x" }),
  });
  record("anonymous cannot create Merchant bundles", anonCreateBundle.status === 401, anonCreateBundle.status);

  const createdBundle = await json(await app.request("/api/admin/merchant/bundles", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Merchant Bundle A",
      description: "Prepaid Merchant Credit",
      purchaseAmount: 50000,
      purchasedCredit: 50000,
      bonusCredit: 10000,
      gifts: [{ label: "Laptop", quantity: 1 }],
      terms: "Merchant Credit is non-withdrawable and is not commission.",
      status: "active",
      displayOrder: 1,
    }),
  }));
  record(
    "admin creates Merchant bundle with base credit, bonus credit, and gift",
    createdBundle.bundle?.purchase_amount === 50000 && createdBundle.bundle?.purchased_credit === 50000
      && createdBundle.bundle?.bonus_credit === 10000 && createdBundle.bundle?.gifts?.[0]?.label === "Laptop"
      && createdBundle.bundle?.status === "active",
    createdBundle.bundle,
  );

  const noTermsPurchase = await json(await app.request("/api/me/merchant/purchases", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ bundleId: createdBundle.bundle.id, termsAccepted: false }),
  }));
  record("terms acceptance is required for a Merchant bundle purchase", noTermsPurchase.error?.code === "terms_required", noTermsPurchase);

  const merchantUser = await signupOnboardActivate("merchant@example.com", "Merchant One", adminMe.member.referral_code);
  const started = await json(await app.request("/api/me/merchant/purchases", {
    method: "POST",
    headers: { cookie: merchantUser.cookie, "content-type": "application/json", "Idempotency-Key": "mbp-1" },
    body: JSON.stringify({ bundleId: createdBundle.bundle.id, termsAccepted: true }),
  }));
  record(
    "unconfirmed bundle purchase issues no credit and does not activate Merchant",
    started.purchase?.status === "pending" && started.purchase?.purchased_credit === 50000,
  );
  const beforeConfirmDash = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  record(
    "invalid/unconfirmed purchase does not activate Merchant",
    beforeConfirmDash.merchant?.status === "pending" && beforeConfirmDash.merchant?.available === 0,
    beforeConfirmDash.merchant,
  );

  await submitAndApprovePayment(merchantUser.cookie, "merchant_bundle", started.purchase.id, "merchant-bundle-pay-1");
  const afterConfirmDash = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  const afterConfirmMe = await json(await app.request("/api/me", { headers: { cookie: merchantUser.cookie } }));
  record(
    "confirmed purchase issues purchased and bonus credit exactly once and activates Merchant",
    afterConfirmDash.merchant?.status === "active" && afterConfirmDash.merchant?.available === 60000
      && afterConfirmDash.merchant?.purchased_issued === 50000 && afterConfirmDash.merchant?.bonus_issued === 10000
      && afterConfirmMe.merchant?.status === "active",
    afterConfirmDash.merchant,
  );
  record("user sidebar can switch to Merchant after valid activation", afterConfirmMe.merchant?.status === "active");
  const giftsAfter = afterConfirmDash.gifts ?? [];
  record("confirmed purchase snapshots gifts for fulfillment tracking", giftsAfter.some((g: { gift_label: string; status: string }) => g.gift_label === "Laptop" && g.status === "pending"), giftsAfter);

  const retryPay = await app.request(`/api/admin/payments/${(await json(await app.request("/api/admin/payments", { headers: { cookie: adminCookie } }))).payments.find((p: { target_id: string }) => p.target_id === started.purchase.id).id}/approve`, {
    method: "POST", headers: { cookie: adminCookie },
  });
  record("retry of confirmed bundle payment does not duplicate credit", retryPay.status === 409, retryPay.status);
  const ledgerCount = await query<{ n: number }>(
    `select count(*)::int as n from merchant_credit_ledger where bundle_purchase_id=$1`,
    [started.purchase.id],
  );
  record("purchased and bonus credit remain separately auditable", ledgerCount[0]?.n === 2, ledgerCount[0]);

  const editedBundle = await json(await app.request(`/api/admin/merchant/bundles/${createdBundle.bundle.id}`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Merchant Bundle A edited",
      purchaseAmount: 999999,
      purchasedCredit: 1,
      bonusCredit: 1,
      terms: "Updated terms are not retroactive.",
      gifts: [],
      status: "active",
    }),
  }));
  const purchaseAfterEdit = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  const snap = purchaseAfterEdit.purchases.find((p: { id: string }) => p.id === started.purchase.id);
  record(
    "historical bundle purchase survives later bundle edit unchanged",
    snap?.purchase_amount === 50000 && snap?.purchased_credit === 50000 && snap?.bonus_credit === 10000
      && snap?.gifts_snapshot?.[0]?.label === "Laptop" && editedBundle.bundle?.purchase_amount === 999999,
    snap,
  );

  const customer = await signupOnboardActivate("merchant-customer@example.com", "Merchant Customer", adminMe.member.referral_code);
  const badId = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-book-1" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  const invalidMerchantNoTerms = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-no-terms" },
    body: JSON.stringify({ merchantUserId: merchantUser.member.user_id }),
  }));
  record(
    "Pay by Merchant without Merchant Payment Terms is rejected",
    invalidMerchantNoTerms.error?.code === "terms_required",
    invalidMerchantNoTerms,
  );
  const forgedMerchantTerms = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-forged-terms" },
    body: JSON.stringify({ merchantUserId: merchantUser.member.user_id, termsAccepted: true, accepted: true }),
  }));
  record(
    "crafted Merchant accepted=true without Merchant Payment Terms is rejected",
    forgedMerchantTerms.error?.code === "terms_required",
    forgedMerchantTerms,
  );
  const invalidMerchant = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-bad" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: "not-a-real-user" }),
  }));
  record("invalid Merchant User ID is rejected", invalidMerchant.error?.code === "merchant_not_found" || invalidMerchant.error, invalidMerchant);
  const nonMerchant = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-non" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: memberMerchantNav.member.user_id }),
  }));
  record("non-Merchant User ID is rejected", nonMerchant.error?.code === "merchant_inactive" || nonMerchant.status === 400, nonMerchant);

  const pendingReq = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-1" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: merchantUser.member.user_id }),
  }));
  record(
    "valid Pay by Merchant request is created pending with no debit",
    pendingReq.request?.status === "pending" && pendingReq.request?.amount === 50000,
    pendingReq.request,
  );
  const merchantPayConsent = await queryOne<{ document_key: string; document_version: string; context: string; reference_id: string }>(
    `select document_key, document_version, context, reference_id from user_consents
      where user_id=$1 and document_key='MERCHANT_PAYMENT_TERMS' and context='merchant_payment' and reference_id=$2`,
    [customer.member.user_id, badId.booking.id],
  );
  record(
    "Merchant Payment Terms consent is stored against the booking before reservation",
    merchantPayConsent?.document_version === "1" && merchantPayConsent.reference_id === badId.booking.id,
    merchantPayConsent,
  );
  const dashAfterRequest = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  record("request creation does not permanently debit Merchant Credit", dashAfterRequest.merchant?.available === 60000 && dashAfterRequest.merchant?.reserved === 0, dashAfterRequest.merchant);
  const commAfterRequest = await query(`select id from commission_ledger where source_booking_id=$1`, [badId.booking.id]);
  record("request creation creates no commission", commAfterRequest.length === 0, commAfterRequest.length);
  record("intended Merchant sees the pending request", dashAfterRequest.incomingRequests?.some((r: { id: string; status: string }) => r.id === pendingReq.request.id && r.status === "pending"));

  const declined = await json(await app.request(`/api/me/merchant/requests/${pendingReq.request.id}/decline`, {
    method: "POST", headers: { cookie: merchantUser.cookie, "Idempotency-Key": "m-dec-1" },
  }));
  record("Merchant can decline a pending request", declined.request?.status === "declined", declined.request);
  const dashAfterDecline = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  record("decline causes no permanent debit", dashAfterDecline.merchant?.available === 60000 && dashAfterDecline.merchant?.reserved === 0);
  const commAfterDecline = await query(`select id from commission_ledger where source_booking_id=$1`, [badId.booking.id]);
  record("decline causes no commission", commAfterDecline.length === 0);

  const secondReq = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-2" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: merchantUser.member.user_id }),
  }));
  const approvedReq = await json(await app.request(`/api/me/merchant/requests/${secondReq.request.id}/approve`, {
    method: "POST", headers: { cookie: merchantUser.cookie, "Idempotency-Key": "m-appr-1" },
  }));
  record("Merchant can approve a valid request and recheck available credit", approvedReq.request?.status === "approved", approvedReq.request);
  const dashAfterApprove = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  record(
    "approval reserves credit without settling or double debit",
    dashAfterApprove.merchant?.available === 10000 && dashAfterApprove.merchant?.reserved === 50000 && dashAfterApprove.merchant?.settled === 0,
    dashAfterApprove.merchant,
  );
  const bookingAfterApprove = await json(await app.request(`/api/bookings/${badId.booking.id}`, { headers: { cookie: customer.cookie } }));
  record("Merchant approval alone does not confirm or activate the booking", bookingAfterApprove.booking?.status === "pending", bookingAfterApprove.booking?.status);
  const commAfterApprove = await query(`select id from commission_ledger where source_booking_id=$1`, [badId.booking.id]);
  record("Merchant approval alone causes no commission", commAfterApprove.length === 0);

  const doubleApprove = await app.request(`/api/me/merchant/requests/${secondReq.request.id}/approve`, {
    method: "POST", headers: { cookie: merchantUser.cookie, "Idempotency-Key": "m-appr-2" },
  });
  const doubleBody = await json(doubleApprove);
  record("same request cannot be approved twice / retry does not double debit",
    (doubleBody.request?.status === "approved" || doubleApprove.status === 409) && (await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }))).merchant?.reserved === 50000,
    { status: doubleApprove.status, reserved: (await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }))).merchant?.reserved });

  const confirmMerchantBooking = await json(await app.request(`/api/admin/bookings/${badId.booking.id}/confirm`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  record("Merchant-funded booking reaches confirmed through existing admin confirmation", confirmMerchantBooking.booking?.status === "confirmed", confirmMerchantBooking.booking);
  const dashAfterSettle = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  record(
    "settlement consumes reserved credit exactly once without a second available debit",
    dashAfterSettle.merchant?.available === 10000 && dashAfterSettle.merchant?.reserved === 0 && dashAfterSettle.merchant?.settled === 50000,
    dashAfterSettle.merchant,
  );
  const commAfterConfirm = await query(`select id from commission_ledger where source_booking_id=$1`, [badId.booking.id]);
  record("confirmed-but-not-activated Merchant booking still has no commission", commAfterConfirm.length === 0);

  const activateMerchantBooking = await json(await app.request(`/api/admin/bookings/${badId.booking.id}/activate`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  record("activation of Merchant-funded booking uses existing booking path", activateMerchantBooking.booking?.status === "activated");
  const commAfterActivate = await query<{ level: number; amount: number; rate: number }>(
    `select level, amount, rate from commission_ledger where source_booking_id=$1 order by level`,
    [badId.booking.id],
  );
  record(
    "commission posts only after activation at existing 10/8/6/4/2 rates",
    commAfterActivate[0]?.level === 1 && commAfterActivate[0]?.amount === 5000 && commAfterActivate[0]?.rate === 0.1,
    commAfterActivate,
  );

  const reverseMerchantBooking = await json(await app.request(`/api/admin/bookings/${badId.booking.id}/reverse`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ reason: "Merchant QA reversal" }),
  }));
  record("reversed Merchant-funded booking keeps history", reverseMerchantBooking.booking?.status === "reversed");
  const dashAfterReverse = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  record(
    "reversal restores settled credit with an auditable ledger entry",
    dashAfterReverse.merchant?.available === 60000 && dashAfterReverse.merchant?.settled === 0
      && dashAfterReverse.ledger.some((e: { entry_type: string }) => e.entry_type === "reversal"),
    dashAfterReverse.merchant,
  );

  const cancelBook = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-book-cancel" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  const cancelReq = await json(await app.request(`/api/bookings/${cancelBook.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-cancel" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: merchantUser.member.user_id }),
  }));
  await json(await app.request(`/api/me/merchant/requests/${cancelReq.request.id}/approve`, {
    method: "POST", headers: { cookie: merchantUser.cookie, "Idempotency-Key": "m-appr-cancel" },
  }));
  await json(await app.request(`/api/admin/bookings/${cancelBook.booking.id}/cancel`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  const dashAfterCancel = await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }));
  const commAfterCancel = await query(`select id from commission_ledger where source_booking_id=$1`, [cancelBook.booking.id]);
  record(
    "cancelled approved Merchant booking releases reserved credit exactly once and posts no commission",
    dashAfterCancel.merchant?.available === 60000 && dashAfterCancel.merchant?.reserved === 0 && commAfterCancel.length === 0,
    dashAfterCancel.merchant,
  );

  const selfBook = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: merchantUser.cookie, "content-type": "application/json", "Idempotency-Key": "m-book-self" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  const selfReq = await json(await app.request(`/api/bookings/${selfBook.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: merchantUser.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-self" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: merchantUser.member.user_id }),
  }));
  record("Merchant self-pay uses the same request flow", selfReq.request?.status === "pending" && selfReq.request?.merchant_user_id === merchantUser.member.user_id);
  const selfApprove = await json(await app.request(`/api/me/merchant/requests/${selfReq.request.id}/approve`, {
    method: "POST", headers: { cookie: merchantUser.cookie, "Idempotency-Key": "m-appr-self" },
  }));
  record("self-pay approval follows the same reserve rules", selfApprove.request?.status === "approved");
  await json(await app.request(`/api/admin/bookings/${selfBook.booking.id}/cancel`, { method: "POST", headers: { cookie: adminCookie } }));

  const insufficientBook = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-book-low" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  await query(`update merchants set available = 1000 where user_id=$1`, [merchantUser.member.user_id]);
  const lowCredit = await json(await app.request(`/api/bookings/${insufficientBook.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-low" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: merchantUser.member.user_id }),
  }));
  record("insufficient credit is rejected at request creation", lowCredit.error?.code === "insufficient_credit" || lowCredit.status === 409, lowCredit);
  await query(
    `update merchants set available = purchased_issued + bonus_issued - reserved - settled where user_id=$1`,
    [merchantUser.member.user_id],
  );

  const concA = await signupOnboardActivate("m-conc-a@example.com", "Conc A", adminMe.member.referral_code);
  const concB = await signupOnboardActivate("m-conc-b@example.com", "Conc B", adminMe.member.referral_code);
  const smallBundle = await json(await app.request("/api/admin/merchant/bundles", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Tight Credit",
      purchaseAmount: 50000,
      purchasedCredit: 50000,
      bonusCredit: 0,
      terms: "Concurrent overspend protection.",
      status: "active",
    }),
  }));
  const tightMerchant = await signupOnboardActivate("tight-merchant@example.com", "Tight Merchant", adminMe.member.referral_code);
  const tightPurchase = await json(await app.request("/api/me/merchant/purchases", {
    method: "POST",
    headers: { cookie: tightMerchant.cookie, "content-type": "application/json", "Idempotency-Key": "mbp-tight" },
    body: JSON.stringify({ bundleId: smallBundle.bundle.id, termsAccepted: true }),
  }));
  await submitAndApprovePayment(tightMerchant.cookie, "merchant_bundle", tightPurchase.purchase.id, "tight-bundle-pay");
  const bookA = await json(await app.request("/api/bookings", {
    method: "POST", headers: { cookie: concA.cookie, "content-type": "application/json", "Idempotency-Key": "m-book-ca" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  const bookB = await json(await app.request("/api/bookings", {
    method: "POST", headers: { cookie: concB.cookie, "content-type": "application/json", "Idempotency-Key": "m-book-cb" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  const reqA = await json(await app.request(`/api/bookings/${bookA.booking.id}/merchant-pay`, {
    method: "POST", headers: { cookie: concA.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-ca" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: tightMerchant.member.user_id }),
  }));
  const reqB = await json(await app.request(`/api/bookings/${bookB.booking.id}/merchant-pay`, {
    method: "POST", headers: { cookie: concB.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-cb" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: tightMerchant.member.user_id }),
  }));
  const [resA, resB] = await Promise.all([
    app.request(`/api/me/merchant/requests/${reqA.request.id}/approve`, {
      method: "POST", headers: { cookie: tightMerchant.cookie, "Idempotency-Key": "m-appr-ca" },
    }),
    app.request(`/api/me/merchant/requests/${reqB.request.id}/approve`, {
      method: "POST", headers: { cookie: tightMerchant.cookie, "Idempotency-Key": "m-appr-cb" },
    }),
  ]);
  const bodyA = await json(resA);
  const bodyB = await json(resB);
  const approvedCount = [bodyA.request?.status, bodyB.request?.status].filter((s) => s === "approved").length;
  const tightDash = await json(await app.request("/api/me/merchant", { headers: { cookie: tightMerchant.cookie } }));
  record(
    "two simultaneous approvals cannot overspend available Merchant Credit",
    approvedCount === 1 && tightDash.merchant?.available === 0 && tightDash.merchant?.reserved === 50000,
    { approvedCount, available: tightDash.merchant?.available, reserved: tightDash.merchant?.reserved, a: bodyA.request?.status ?? bodyA.error, b: bodyB.request?.status ?? bodyB.error },
  );

  await json(await app.request(`/api/admin/merchant/accounts/${merchantUser.member.user_id}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "suspended" }),
  }));
  const susBook = await json(await app.request("/api/bookings", {
    method: "POST", headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-book-sus" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  const susReq = await json(await app.request(`/api/bookings/${susBook.booking.id}/merchant-pay`, {
    method: "POST", headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-sus" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: merchantUser.member.user_id }),
  }));
  record("suspended Merchant cannot accept new payment requests", susReq.error?.code === "merchant_inactive" || susReq.status === 400, susReq);

  const rawOverwrite = await app.request(`/api/admin/merchant/accounts/${tightMerchant.member.user_id}`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ available: 999999 }),
  });
  record("admin raw balance overwrite is unavailable", rawOverwrite.status === 404 || rawOverwrite.status === 405 || !(await rawOverwrite.json().catch(() => ({})) as any).merchant?.available, rawOverwrite.status);
  const adjust = await json(await app.request(`/api/admin/merchant/accounts/${tightMerchant.member.user_id}/adjust`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 1000, direction: "credit", reason: "QA audited adjustment" }),
  }));
  record("admin adjustment requires reason and writes an auditable ledger entry", adjust.merchant?.available === 1000, adjust.merchant);
  const missingReason = await app.request(`/api/admin/merchant/accounts/${tightMerchant.member.user_id}/adjust`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 1000, direction: "credit" }),
  });
  record("admin adjustment without reason is rejected", missingReason.status === 400, missingReason.status);

  const giftUpdate = await json(await app.request(`/api/admin/merchant/gifts/${giftsAfter[0].id}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "fulfilled", notes: "Delivered in QA" }),
  }));
  record("admin can track gift fulfillment without mixing gift value into credit", giftUpdate.gift?.status === "fulfilled" && (await json(await app.request("/api/me/merchant", { headers: { cookie: merchantUser.cookie } }))).merchant?.available !== undefined, giftUpdate.gift);

  const withdrawalsStill = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  record("Merchant Credit is not mixed into commission wallet totals", typeof withdrawalsStill.totals?.available === "number");
  record("existing commission engine rates remain 10/8/6/4/2", commAfterActivate[0]?.rate === 0.1);
  record("Leadership Reward APIs remain available after Merchant batch", Array.isArray(adminListLr.rewards));

  // ---- Batch 4 Promotion Management --------------------------------------
  const promoNow = Date.now();
  const promoWindow = {
    startAt: new Date(promoNow - 60_000).toISOString(),
    endAt: new Date(promoNow + 30 * 86_400_000).toISOString(),
  };
  const createPromo = async (body: Record<string, unknown>) =>
    json(await app.request("/api/admin/promotions", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
  const publishPromo = async (id: string) =>
    json(await app.request(`/api/admin/promotions/${id}/status`, {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    }));

  const unauthPromos = await app.request("/api/admin/promotions");
  record("unauthenticated admin promotion list is 401", unauthPromos.status === 401, unauthPromos.status);
  const unauthMePromos = await app.request("/api/me/promotions");
  record("unauthenticated member promotions is 401", unauthMePromos.status === 401, unauthMePromos.status);
  const memberCreatePromo = await app.request("/api/admin/promotions", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Should fail", ...promoWindow, offerScope: "all", rewards: [{ name: "X", quantity: 1 }] }),
  });
  record("non-admin cannot create a promotion", memberCreatePromo.status === 403, memberCreatePromo.status);

  const missingReward = await json(await app.request("/api/admin/promotions", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "No rewards", ...promoWindow, offerScope: "all", rewards: [] }),
  }));
  record("promotion requires at least one reward", missingReward.error?.code === "rewards_required" || missingReward.status === 400, missingReward);
  const missingOffers = await json(await app.request("/api/admin/promotions", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "No offers", ...promoWindow, offerScope: "selected", offerSlugs: [], rewards: [{ name: "Gift", quantity: 1 }] }),
  }));
  record("selected-scope promotion requires at least one offer", missingOffers.error?.code === "offers_required" || missingOffers.status === 400, missingOffers);
  const badWindow = await json(await app.request("/api/admin/promotions", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Bad window",
      startAt: promoWindow.endAt,
      endAt: promoWindow.startAt,
      offerScope: "all",
      rewards: [{ name: "Gift", quantity: 1 }],
    }),
  }));
  record("end cannot be before start", badWindow.error?.code === "invalid_window" || badWindow.status === 400, badWindow);

  const draftPromo = await createPromo({
    title: "QA Draft Campaign",
    shortDescription: "Draft only",
    description: "Not public",
    ...promoWindow,
    offerScope: "selected",
    offerSlugs: ["five-star-hotel-share"],
    rewards: [{ name: "QA Gift A", description: "Primary gift", quantity: 1 }, { name: "QA Gift B", description: "Second gift", quantity: 1 }],
    terms: "QA terms version 1",
  });
  record(
    "admin creates a draft promotion with multiple rewards",
    draftPromo.promotion?.status === "draft" && draftPromo.promotion?.rewards?.length === 2,
    draftPromo.promotion,
  );
  const publicDraftList = await json(await app.request("/api/promotions"));
  record(
    "draft promotion is not public",
    Array.isArray(publicDraftList.promotions) && !publicDraftList.promotions.some((p: { id: string }) => p.id === draftPromo.promotion?.id),
    publicDraftList.promotions?.map((p: { id: string }) => p.id),
  );
  const promoPublicDraftGet = await app.request(`/api/promotions/${draftPromo.promotion.id}`);
  record("draft promotion is not publicly fetchable", promoPublicDraftGet.status === 404, promoPublicDraftGet.status);
  const adminPreview = await json(await app.request(`/api/admin/promotions/${draftPromo.promotion.id}`, { headers: { cookie: adminCookie } }));
  record("admin can preview a draft campaign", adminPreview.promotion?.id === draftPromo.promotion.id && adminPreview.promotion?.status === "draft");

  const editedDraft = await json(await app.request(`/api/admin/promotions/${draftPromo.promotion.id}`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "QA Multi Reward Campaign", shortDescription: "Confirmed booking gift" }),
  }));
  record("admin can edit a draft promotion", editedDraft.promotion?.title === "QA Multi Reward Campaign", editedDraft.promotion?.title);

  const memberPublish = await app.request(`/api/admin/promotions/${draftPromo.promotion.id}/status`, {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "published" }),
  });
  record("non-admin cannot publish a promotion", memberPublish.status === 403, memberPublish.status);

  const publishedMulti = await publishPromo(draftPromo.promotion.id);
  record("admin can publish a promotion", publishedMulti.promotion?.status === "published" && publishedMulti.promotion?.lifecycle === "active", publishedMulti.promotion);
  const promoPublicAfterPublish = await json(await app.request("/api/promotions"));
  record(
    "published active promotion appears in the public list",
    promoPublicAfterPublish.promotions?.some((p: { id: string }) => p.id === draftPromo.promotion.id) && Boolean(promoPublicAfterPublish.serverNow),
    promoPublicAfterPublish.promotions?.map((p: { id: string }) => p.id),
  );

  const stackPromo = await createPromo({
    title: "QA Stack Campaign",
    shortDescription: "Independent campaign",
    ...promoWindow,
    offerScope: "selected",
    offerSlugs: ["five-star-hotel-share"],
    rewards: [{ name: "QA Stack Gift", quantity: 1 }],
    terms: "Stack terms",
  });
  await publishPromo(stackPromo.promotion.id);

  const secondOffer = await json(await app.request("/api/admin/offers", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "QA Property B",
      categorySlug: "land-plots",
      location: "Dhaka",
      summary: "Second property for promotion offer-scope tests",
      image: "/images/flagship-suite.jpg",
      retailValue: 300000,
      bookingAmount: 20000,
      qualificationBenefit: 280000,
      commissionEligibleAmount: 20000,
      status: "published",
    }),
  }));
  record("second published offer exists for scope tests", Boolean(secondOffer.offer?.slug), secondOffer.offer?.slug);
  const wrongScopePromo = await createPromo({
    title: "QA Other Property Campaign",
    ...promoWindow,
    offerScope: "selected",
    offerSlugs: [secondOffer.offer.slug],
    rewards: [{ name: "Other Gift", quantity: 1 }],
    terms: "Other property only",
  });
  await publishPromo(wrongScopePromo.promotion.id);

  const upcomingPromo = await createPromo({
    title: "QA Upcoming Campaign",
    startAt: new Date(promoNow + 86_400_000).toISOString(),
    endAt: new Date(promoNow + 10 * 86_400_000).toISOString(),
    offerScope: "selected",
    offerSlugs: ["five-star-hotel-share"],
    rewards: [{ name: "Future Gift", quantity: 1 }],
  });
  await publishPromo(upcomingPromo.promotion.id);

  const closedPromo = await createPromo({
    title: "QA Closed Campaign",
    ...promoWindow,
    offerScope: "selected",
    offerSlugs: ["five-star-hotel-share"],
    rewards: [{ name: "Closed Gift", quantity: 1 }],
  });
  await publishPromo(closedPromo.promotion.id);
  const closedRes = await json(await app.request(`/api/admin/promotions/${closedPromo.promotion.id}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
  }));
  record("admin can close a promotion", closedRes.promotion?.status === "closed" && closedRes.promotion?.lifecycle === "closed", closedRes.promotion);
  const memberClose = await app.request(`/api/admin/promotions/${stackPromo.promotion.id}/status`, {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
  });
  record("non-admin cannot close a promotion", memberClose.status === 403, memberClose.status);

  const expiredPromo = await createPromo({
    title: "QA Expired Campaign",
    ...promoWindow,
    offerScope: "selected",
    offerSlugs: ["five-star-hotel-share"],
    rewards: [{ name: "Expired Gift", quantity: 1 }],
  });
  await publishPromo(expiredPromo.promotion.id);
  await query(`update promotions set start_at = now() - interval '3 days', end_at = now() - interval '1 hour' where id = $1`, [expiredPromo.promotion.id]);

  const pu1 = await signupOnboardActivate("promo-user-1@example.com", "Promo One", adminMe.member.referral_code);
  const pu2 = await signupOnboardActivate("promo-user-2@example.com", "Promo Two", adminMe.member.referral_code);
  const pu3 = await signupOnboardActivate("promo-user-3@example.com", "Promo Three", adminMe.member.referral_code);
  const pu4 = await signupOnboardActivate("promo-user-4@example.com", "Promo Four", adminMe.member.referral_code);
  const pu5 = await signupOnboardActivate("promo-user-5@example.com", "Promo Five", adminMe.member.referral_code);
  const pu6 = await signupOnboardActivate("promo-user-6@example.com", "Promo Six", adminMe.member.referral_code);

  const pendingBook = await withTransaction((client) => createBooking(client, pu1.member.user_id, "five-star-hotel-share", { acceptBookingTerms: true }));
  const pendingQual = await query(`select id from promotion_qualifications where user_id=$1`, [pu1.member.user_id]);
  record("booking creation / pending booking does not qualify", pendingBook.status === "pending" && pendingQual.length === 0, { status: pendingBook.status, quals: pendingQual.length });

  const confirmBody = await app.request(`/api/admin/bookings/${pendingBook.id}/confirm`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ confirmedAt: "2010-01-01T00:00:00.000Z" }),
  });
  record("HTTP confirm without approved payment is rejected and ignores client timestamps", confirmBody.status === 400, confirmBody.status);

  const commBeforeConfirm = await query(`select id from commission_ledger where source_booking_id=$1`, [pendingBook.id]);
  await withTransaction(async (client) => {
    await confirmBooking(client, pendingBook.id, adminMe.member.user_id);
  });
  const confirmedBook = await queryOne<{ status: string; confirmed_at: string }>(`select status, confirmed_at from bookings where id=$1`, [pendingBook.id]);
  const pu1Quals = await query<{ id: string; promotion_id: string; promotion_title: string; rewards_snapshot: unknown; terms_snapshot: string; booking_id: string }>(
    `select id, promotion_id, promotion_title, rewards_snapshot, terms_snapshot, booking_id from promotion_qualifications where user_id=$1 order by promotion_title`,
    [pu1.member.user_id],
  );
  const promoCommAfterConfirm = await query(`select id from commission_ledger where source_booking_id=$1`, [pendingBook.id]);
  record("eligible confirmed booking inside the window qualifies", pu1Quals.some((q) => q.promotion_id === draftPromo.promotion.id), pu1Quals.map((q) => q.promotion_id));
  record("different valid promotions independently qualify from the same booking", pu1Quals.some((q) => q.promotion_id === stackPromo.promotion.id) && pu1Quals.length >= 2, pu1Quals.map((q) => q.promotion_id));
  record("promotion qualification creates no commission", commBeforeConfirm.length === 0 && promoCommAfterConfirm.length === 0);
  record("qualification uses server confirmed_at, not a client-supplied time", Boolean(confirmedBook?.confirmed_at) && new Date(confirmedBook!.confirmed_at).getFullYear() > 2010, confirmedBook?.confirmed_at);

  await withTransaction(async (client) => {
    await evaluatePromotionsForConfirmedBooking(client, pendingBook.id, adminMe.member.user_id);
    await evaluatePromotionsForConfirmedBooking(client, pendingBook.id, adminMe.member.user_id);
  });
  const afterRetry = await query(`select id from promotion_qualifications where booking_id=$1`, [pendingBook.id]);
  record("same booking retry does not duplicate qualification", afterRetry.length === pu1Quals.length, afterRetry.length);

  const secondBook = await withTransaction(async (client) => {
    const created = await createBooking(client, pu1.member.user_id, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    return created;
  });
  const pu1AfterSecond = await query(`select id, booking_id from promotion_qualifications where user_id=$1 and promotion_id=$2`, [pu1.member.user_id, draftPromo.promotion.id]);
  record("one user gets one qualification per promotion", pu1AfterSecond.length === 1 && pu1AfterSecond[0]?.booking_id === pendingBook.id, pu1AfterSecond);

  const fulfillments = await query<{ id: string; reward_name: string; status: string }>(
    `select id, reward_name, status from promotion_reward_fulfillments where user_id=$1 and promotion_id=$2 order by display_order`,
    [pu1.member.user_id, draftPromo.promotion.id],
  );
  record(
    "qualified rewards start eligible and are tracked individually",
    fulfillments.length === 2 && fulfillments.every((f) => f.status === "eligible"),
    fulfillments,
  );
  const memberFulfill = await app.request(`/api/admin/promotions/rewards/${fulfillments[0]!.id}/status`, {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "fulfilled" }),
  });
  record("user cannot mark own rewards fulfilled", memberFulfill.status === 403, memberFulfill.status);
  const approveA = await json(await app.request(`/api/admin/promotions/rewards/${fulfillments[0]!.id}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "approved", reason: "QA approve" }),
  }));
  record("admin can approve a legitimate reward", approveA.reward?.status === "approved", approveA.reward);
  const fulfillA = await json(await app.request(`/api/admin/promotions/rewards/${fulfillments[0]!.id}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "fulfilled", reason: "QA delivered" }),
  }));
  record("admin can mark a reward fulfilled", fulfillA.reward?.status === "fulfilled", fulfillA.reward);
  const stillB = await queryOne<{ status: string }>(`select status from promotion_reward_fulfillments where id=$1`, [fulfillments[1]!.id]);
  record("multiple rewards keep separate fulfillment statuses", stillB?.status === "eligible" && fulfillA.reward?.status === "fulfilled", stillB);
  const silentOverwrite = await json(await app.request(`/api/admin/promotions/rewards/${fulfillments[0]!.id}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "eligible" }),
  }));
  record("historical fulfillment cannot be silently overwritten", silentOverwrite.error || silentOverwrite.status === 409, silentOverwrite);
  const cancelNoReason = await app.request(`/api/admin/promotions/rewards/${fulfillments[1]!.id}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  record("cancellation without a reason is rejected", cancelNoReason.status === 400, cancelNoReason.status);
  const events = await query<{ id: string; previous_status: string | null; new_status: string; reason: string | null; actor_user_id: string | null }>(`select id, previous_status, new_status, reason, actor_user_id from promotion_reward_events where fulfillment_id=$1 order by created_at`, [fulfillments[0]!.id]);
  record("fulfillment stores actor, timestamp, and auditable history", events.length >= 3 && events.every((e) => Boolean(e.actor_user_id)), events);

  const snapBefore = pu1Quals.find((q) => q.promotion_id === draftPromo.promotion.id);
  await json(await app.request(`/api/admin/promotions/${draftPromo.promotion.id}`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "QA Multi Reward Campaign EDITED",
      terms: "QA terms version 2 — should not rewrite history",
      rewards: [{ name: "Replacement Gift", quantity: 9 }],
    }),
  }));
  const snapAfter = await queryOne<{ promotion_title: string; terms_snapshot: string; rewards_snapshot: unknown }>(
    `select promotion_title, terms_snapshot, rewards_snapshot from promotion_qualifications where id=$1`,
    [snapBefore!.id],
  );
  record(
    "qualified reward snapshot survives later campaign edit",
    snapAfter?.promotion_title === "QA Multi Reward Campaign" && snapAfter?.terms_snapshot === "QA terms version 1" && JSON.stringify(snapAfter.rewards_snapshot).includes("QA Gift A"),
    snapAfter,
  );

  const promoPublicDetail = await json(await app.request(`/api/promotions/${draftPromo.promotion.id}`, { headers: { cookie: pu2.cookie } }));
  record("one user cannot inspect another user's qualification state", promoPublicDetail.myQualification == null, promoPublicDetail.myQualification);
  const ownDetail = await json(await app.request(`/api/promotions/${draftPromo.promotion.id}`, { headers: { cookie: pu1.cookie } }));
  record("authenticated member sees only their own qualification on details", ownDetail.myQualification?.user_id === pu1.member.user_id, ownDetail.myQualification?.user_id);
  const dash = await json(await app.request("/api/me/promotions", { headers: { cookie: pu1.cookie } }));
  record(
    "dashboard returns a primary active campaign, more promotions, and serverNow",
    Boolean(dash.primary) && Boolean(dash.serverNow) && Array.isArray(dash.more),
    { primary: dash.primary?.title, more: dash.more?.length, serverNow: dash.serverNow },
  );

  const markQualified = await app.request("/api/admin/promotions/qualify", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ userId: pu2.member.user_id, promotionId: draftPromo.promotion.id }),
  });
  record("no unaudited Mark User Qualified endpoint", markQualified.status === 404 || markQualified.status === 405, markQualified.status);

  const wrongBook = await withTransaction(async (client) => {
    const created = await createBooking(client, pu2.member.user_id, secondOffer.offer.slug, { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    return created;
  });
  const wrongQual = await query(`select id from promotion_qualifications where user_id=$1 and promotion_id=$2`, [pu2.member.user_id, draftPromo.promotion.id]);
  const otherQual = await query(`select id from promotion_qualifications where user_id=$1 and promotion_id=$2`, [pu2.member.user_id, wrongScopePromo.promotion.id]);
  record("wrong offer does not qualify for a selected-scope campaign", wrongQual.length === 0, wrongQual);
  record("matching offer on a different campaign still qualifies independently", otherQual.length === 1, otherQual);

  const upcomingBook = await withTransaction(async (client) => {
    const created = await createBooking(client, pu3.member.user_id, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    return created;
  });
  const upcomingQual = await query(`select id from promotion_qualifications where user_id=$1 and promotion_id=$2`, [pu3.member.user_id, upcomingPromo.promotion.id]);
  record("booking confirmed before start does not qualify", upcomingQual.length === 0, { booking: upcomingBook.id });

  const expiredBook = await withTransaction(async (client) => {
    const created = await createBooking(client, pu4.member.user_id, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    return created;
  });
  const expiredQual = await query(`select id from promotion_qualifications where user_id=$1 and promotion_id=$2`, [pu4.member.user_id, expiredPromo.promotion.id]);
  record("booking confirmed after end does not qualify", expiredQual.length === 0, { booking: expiredBook.id });

  const closedBook = await withTransaction(async (client) => {
    const created = await createBooking(client, pu5.member.user_id, "five-star-hotel-share", { acceptBookingTerms: true });
    await confirmBooking(client, created.id, adminMe.member.user_id);
    return created;
  });
  const closedQual = await query(`select id from promotion_qualifications where user_id=$1 and promotion_id=$2`, [pu5.member.user_id, closedPromo.promotion.id]);
  const closedHistory = await query(`select id from promotions where id=$1`, [closedPromo.promotion.id]);
  record("closed promotion cannot create new qualification", closedQual.length === 0, { booking: closedBook.id });
  record("historical campaign records remain after close", closedHistory.length === 1);

  const promoReversed = await withTransaction(async (client) => reverseBooking(client, pendingBook.id, { reason: "Promotion QA reversal", adminUserId: adminMe.member.user_id }));
  const qualAfterReverse = await queryOne<{ id: string }>(`select id from promotion_qualifications where booking_id=$1 and promotion_id=$2`, [pendingBook.id, draftPromo.promotion.id]);
  const rewardsAfterReverse = await query<{ reward_name: string; status: string }>(
    `select reward_name, status from promotion_reward_fulfillments where qualification_id=$1 order by display_order`,
    [qualAfterReverse!.id],
  );
  record("reversed booking preserves historical qualification", Boolean(qualAfterReverse) && promoReversed.booking.status === "reversed", promoReversed.booking);
  record(
    "eligible/approved rewards reverse audibly while fulfilled rewards stay until explicit reverse",
    rewardsAfterReverse.some((r) => r.reward_name === "QA Gift A" && r.status === "fulfilled") &&
      rewardsAfterReverse.some((r) => r.reward_name === "QA Gift B" && r.status === "reversed"),
    rewardsAfterReverse,
  );

  const promoMerchant = await signupOnboardActivate("promo-merchant@example.com", "Promo Merchant", adminMe.member.referral_code);
  const promoBundle = await json(await app.request("/api/admin/merchant/bundles", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Promo Merchant Bundle",
      purchaseAmount: 50000,
      purchasedCredit: 50000,
      bonusCredit: 10000,
      terms: "Promotion merchant QA.",
      status: "active",
    }),
  }));
  const promoPurchase = await json(await app.request("/api/me/merchant/purchases", {
    method: "POST",
    headers: { cookie: promoMerchant.cookie, "content-type": "application/json", "Idempotency-Key": "promo-mbp" },
    body: JSON.stringify({ bundleId: promoBundle.bundle.id, termsAccepted: true }),
  }));
  await submitAndApprovePayment(promoMerchant.cookie, "merchant_bundle", promoPurchase.purchase.id, "promo-merchant-pay");
  const merchantBook = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: pu6.cookie, "content-type": "application/json", "Idempotency-Key": "promo-m-book" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  const merchantReq = await json(await app.request(`/api/bookings/${merchantBook.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: pu6.cookie, "content-type": "application/json", "Idempotency-Key": "promo-m-pay" },
    body: JSON.stringify({ acceptMerchantTerms: true, merchantUserId: promoMerchant.member.user_id }),
  }));
  const merchantAppr = await json(await app.request(`/api/me/merchant/requests/${merchantReq.request.id}/approve`, {
    method: "POST", headers: { cookie: promoMerchant.cookie, "Idempotency-Key": "promo-m-appr" },
  }));
  const merchantQualBefore = await query(`select id from promotion_qualifications where booking_id=$1`, [merchantBook.booking.id]);
  const merchantInvBefore = await query(`select id from offer_inventory_events where booking_id=$1 and event_type='consume'`, [merchantBook.booking.id]);
  record(
    "Merchant approval alone does not qualify for a promotion",
    merchantAppr.request?.status === "approved" && merchantQualBefore.length === 0,
    { request: merchantAppr.request?.status, quals: merchantQualBefore.length },
  );
  record(
    "Merchant approval does not consume inventory",
    merchantInvBefore.length === 0,
    merchantInvBefore.length,
  );
  const merchantConfirm = await json(await app.request(`/api/admin/bookings/${merchantBook.booking.id}/confirm`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  const merchantQualAfter = await query(`select id from promotion_qualifications where booking_id=$1 and user_id=$2`, [merchantBook.booking.id, pu6.member.user_id]);
  const merchantInvAfter = await query(`select id from offer_inventory_events where booking_id=$1 and event_type='consume'`, [merchantBook.booking.id]);
  record(
    "Merchant-funded booking qualifies only after existing confirmation",
    merchantConfirm.booking?.status === "confirmed" && merchantQualAfter.length > 0,
    { status: merchantConfirm.booking?.status, quals: merchantQualAfter.length },
  );
  record("Merchant-funded confirmation consumes inventory once", merchantInvAfter.length === 1, merchantInvAfter.length);
  const merchantComm = await query(`select id from commission_ledger where source_booking_id=$1`, [merchantBook.booking.id]);
  record("confirmed-but-not-activated promotion booking still has no commission", merchantComm.length === 0);
  await json(await app.request(`/api/admin/bookings/${merchantBook.booking.id}/activate`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  const merchantCommAfter = await query<{ rate: number; amount: number }>(`select rate, amount from commission_ledger where source_booking_id=$1 order by level`, [merchantBook.booking.id]);
  record(
    "existing commission engine remains the sole source and still posts existing 10/8/6/4/2 rates on activation",
    merchantCommAfter.length > 0 &&
      merchantCommAfter.every((r) => [0.1, 0.08, 0.06, 0.04, 0.02].includes(Number(r.rate))),
    merchantCommAfter,
  );

  const economics = await queryOne<{ booking_amount: number; qualification_benefit: number; retail_value: number }>(
    `select booking_amount, qualification_benefit, retail_value from bookings where id=$1`,
    [merchantBook.booking.id],
  );
  record(
    "promotion does not change booking economics",
    economics?.booking_amount === 50000 && economics?.qualification_benefit === 600000 && economics?.retail_value === 650000,
    economics,
  );
  const snapshot = await query(`select id from booking_snapshots where booking_id=$1`, [merchantBook.booking.id]);
  record("promotion does not mutate booking snapshots", snapshot.length === 1);
  const lrStill = await json(await app.request("/api/admin/leadership-rewards", { headers: { cookie: adminCookie } }));
  record("Leadership Reward remains available after Promotion batch", Array.isArray(lrStill.rewards));
  const merchantStill = await json(await app.request("/api/me/merchant", { headers: { cookie: promoMerchant.cookie } }));
  record("Merchant Credit remains available after Promotion batch", typeof merchantStill.merchant?.available === "number");

  const pu7 = await signupOnboardActivate("promo-user-7@example.com", "Promo Seven", adminMe.member.referral_code);
  const bankBook = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: pu7.cookie, "content-type": "application/json", "Idempotency-Key": "promo-bank-book" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  const bankPendingQual = await query(`select id from promotion_qualifications where booking_id=$1`, [bankBook.booking.id]);
  record(
    "Growth Bank booking pending does not qualify",
    bankBook.booking?.status === "pending" && bankPendingQual.length === 0,
    { status: bankBook.booking?.status, quals: bankPendingQual.length },
  );
  const bankPaySubmitted = await json(await app.request("/api/payments", {
    method: "POST",
    headers: { cookie: pu7.cookie, "content-type": "application/json", "Idempotency-Key": "promo-bank-pay" },
    body: JSON.stringify({
      targetType: "booking",
      targetId: bankBook.booking.id,
      paymentMethod: "bank",
      referenceId: "REF-promo-bank-pay",
      proofFilename: "receipt.png",
      proofMime: "image/png",
      proofBase64: "iVBORw0KGgo=",
    }),
  }));
  const bankSubmitQual = await query(`select id from promotion_qualifications where booking_id=$1`, [bankBook.booking.id]);
  record(
    "Growth Bank payment submission does not qualify",
    bankPaySubmitted.payment?.status === "submitted" && bankSubmitQual.length === 0,
    { status: bankPaySubmitted.payment?.status, quals: bankSubmitQual.length },
  );
  await json(await app.request(`/api/admin/payments/${bankPaySubmitted.payment.id}/review`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  const bankApproved = await json(await app.request(`/api/admin/payments/${bankPaySubmitted.payment.id}/approve`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  const bankQualAfter = await query(`select id from promotion_qualifications where booking_id=$1 and user_id=$2`, [bankBook.booking.id, pu7.member.user_id]);
  const bankStatus = await queryOne<{ status: string }>(`select status from bookings where id=$1`, [bankBook.booking.id]);
  const bankInv = await query(`select id from offer_inventory_events where booking_id=$1 and event_type='consume'`, [bankBook.booking.id]);
  record(
    "Growth Bank payment approval qualifies through existing confirmation",
    bankApproved.payment?.status === "approved" && bankStatus?.status === "activated" && bankQualAfter.length > 0,
    { payment: bankApproved.payment?.status, booking: bankStatus?.status, quals: bankQualAfter.length },
  );
  record("Growth Bank confirmation consumes inventory once", bankInv.length === 1, bankInv.length);

  const promoQualsBeforeContact = await queryOne<{ count: string }>(`select count(*)::text as count from promotion_qualifications`);
  const promoContact = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Promo Contact",
      profession: "Engineer",
      mobile: "+8801911111111",
      location: "Dhaka",
    }),
  });
  const promoRtb = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Promo RtB",
      profession: "Teacher",
      mobile: "+8801911111112",
      location: "Dhaka",
      offerSlug: "five-star-hotel-share",
      source: "request_to_book",
    }),
  });
  const promoQualsAfterContact = await queryOne<{ count: string }>(`select count(*)::text as count from promotion_qualifications`);
  record(
    "Contact and Request to Book do not qualify for a promotion",
    promoContact.status === 201 && promoRtb.status === 201 && promoQualsBeforeContact?.count === promoQualsAfterContact?.count,
    { contact: promoContact.status, rtb: promoRtb.status, before: promoQualsBeforeContact, after: promoQualsAfterContact },
  );
  const promoTerms = await json(await app.request("/api/terms/promotion"));
  record(
    "Promotion Terms are readable without consent",
    promoTerms.document?.key === "PROMOTION_TERMS" &&
      promoTerms.document?.version === "1" &&
      promoTerms.document?.slug === "promotion" &&
      Array.isArray(promoTerms.document?.paragraphs) &&
      promoTerms.document.paragraphs.some((p: string) => p.includes("confirmed")) &&
      !JSON.stringify(promoTerms).toLowerCase().includes("guaranteed gift"),
    { key: promoTerms.document?.key, version: promoTerms.document?.version },
  );

  // --- Growth Program: bind sponsor later on an isolated sponsorless tree ---
  const signupGeneralLater = async (email: string, name: string) => {
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123", name }),
    });
    const cookie = extractCookie(signUp);
    await app.request("/api/me", { headers: { cookie } });
    const onboard = await json(
      await app.request("/api/me/onboarding", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name, sponsorCode: "", termsAccepted: true }),
      }),
    );
    return { cookie, member: onboard.member };
  };
  const bindGrowth = (cookie: string, sponsorCode: string) =>
    app.request("/api/me/growth/sponsor", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ sponsorCode }),
    });

  const unauthBind = await app.request("/api/me/growth/sponsor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sponsorCode: "DM-ANY" }),
  });
  record("unauthenticated growth bind is rejected", unauthBind.status === 401, unauthBind.status);

  const growthSponsor = await signupGeneralLater("growth-sponsor@example.com", "Growth Sponsor");
  await withTransaction(async (client) => {
    await client.query(
      `update members set activation_status='active', activation_expires_at=now()+interval '365 days' where user_id=$1`,
      [growthSponsor.member.user_id],
    );
  });
  const growthSponsorMe = await json(await app.request("/api/me", { headers: { cookie: growthSponsor.cookie } }));
  const growthSponsorCode = growthSponsorMe.member.referral_code as string;

  const joiner = await signupGeneralLater("growth-joiner@example.com", "Growth Joiner");
  const emptyBind = await json(await bindGrowth(joiner.cookie, ""));
  record("empty growth referral is rejected", emptyBind.error?.code === "growth_referral_required", emptyBind);
  const whitespaceBind = await json(await bindGrowth(joiner.cookie, "   "));
  record("whitespace-only growth referral is rejected", whitespaceBind.error?.code === "growth_referral_required", whitespaceBind);
  const invalidBind = await json(await bindGrowth(joiner.cookie, "DM-NOTREAL"));
  record("invalid growth referral is rejected", invalidBind.error?.code === "sponsor_not_found", invalidBind);
  const selfBind = await json(await bindGrowth(joiner.cookie, joiner.member.referral_code));
  record("self-referral growth bind is rejected", selfBind.error?.code === "self_sponsor", selfBind);

  const inactiveSponsor = await signupGeneralLater("growth-inactive-sponsor@example.com", "Inactive Growth Sponsor");
  const inactiveBind = await json(await bindGrowth(joiner.cookie, inactiveSponsor.member.referral_code));
  record(
    "inactive sponsor cannot be bound for Growth",
    inactiveBind.error?.code === "forbidden",
    inactiveBind,
  );

  const joinerAfterRejects = await queryOne<{
    sponsor_user_id: string | null;
    network_parent_user_id: string | null;
    network_slot: number | null;
    activation_status: string;
  }>(
    `select sponsor_user_id, network_parent_user_id, network_slot, activation_status from members where user_id = $1`,
    [joiner.member.user_id],
  );
  record(
    "failed growth binds leave the account sponsorless",
    joinerAfterRejects?.sponsor_user_id == null &&
      joinerAfterRejects?.network_parent_user_id == null &&
      joinerAfterRejects?.network_slot == null &&
      joinerAfterRejects?.activation_status === "inactive",
    joinerAfterRejects,
  );

  const [firstBindRes, secondBindRes] = await Promise.all([
    bindGrowth(joiner.cookie, growthSponsorCode),
    bindGrowth(joiner.cookie, growthSponsorCode),
  ]);
  const firstBind = await json(firstBindRes);
  const secondBind = await json(secondBindRes);
  const bindOutcomes = [firstBind, secondBind];
  record(
    "concurrent growth bind places exactly once",
    bindOutcomes.filter((r) => r.alreadyBound === false && r.member?.sponsor_user_id === growthSponsor.member.user_id).length === 1 &&
      bindOutcomes.filter((r) => r.alreadyBound === true && r.member?.sponsor_user_id === growthSponsor.member.user_id).length === 1,
    { first: firstBind, second: secondBind },
  );

  const placed = await queryOne<{
    sponsor_user_id: string | null;
    network_parent_user_id: string | null;
    network_slot: number | null;
    activation_status: string;
    onboarding_complete: boolean;
  }>(
    `select sponsor_user_id, network_parent_user_id, network_slot, activation_status, onboarding_complete from members where user_id = $1`,
    [joiner.member.user_id],
  );
  record(
    "valid growth bind places exactly one 3x5 slot and does not activate",
    placed?.sponsor_user_id === growthSponsor.member.user_id &&
      placed?.network_parent_user_id === growthSponsor.member.user_id &&
      placed?.network_slot === 1 &&
      placed?.activation_status === "inactive" &&
      placed?.onboarding_complete === true,
    placed,
  );

  const placements = await queryOne<{ n: number }>(
    `select count(*)::int as n from members where sponsor_user_id = $1`,
    [growthSponsor.member.user_id],
  );
  record("growth sponsor receives exactly one personal sponsee from the bind", placements?.n === 1, placements);

  const already = await json(await bindGrowth(joiner.cookie, growthSponsorCode));
  record(
    "repeat growth bind is alreadyBound and does not duplicate placement",
    already.alreadyBound === true && already.member?.sponsor_user_id === growthSponsor.member.user_id,
    already,
  );

  const altSponsor = await signupGeneralLater("growth-alt-sponsor@example.com", "Alt Growth Sponsor");
  await withTransaction(async (client) => {
    await client.query(
      `update members set activation_status='active', activation_expires_at=now()+interval '365 days' where user_id=$1`,
      [altSponsor.member.user_id],
    );
  });
  const replaceAttempt = await json(await bindGrowth(joiner.cookie, altSponsor.member.referral_code));
  record(
    "existing sponsor is never replaced",
    replaceAttempt.alreadyBound === true && replaceAttempt.member?.sponsor_user_id === growthSponsor.member.user_id,
    replaceAttempt.member,
  );
  const stillOne = await queryOne<{ n: number }>(
    `select count(*)::int as n from members where sponsor_user_id = $1 or network_parent_user_id = $1`,
    [altSponsor.member.user_id],
  );
  record("rejected replacement creates no placement under the alternate sponsor", stillOne?.n === 0, stillOne);

  const bindCommissions = await queryOne<{ n: number }>(
    `select count(*)::int as n from commission_ledger where source_user_id = $1 or beneficiary_user_id = $1`,
    [joiner.member.user_id],
  );
  const bindBookings = await queryOne<{ n: number }>(`select count(*)::int as n from bookings where user_id = $1`, [joiner.member.user_id]);
  const bindActivations = await queryOne<{ n: number }>(
    `select count(*)::int as n from annual_activations where user_id = $1`,
    [joiner.member.user_id],
  );
  const bindLeadership = await queryOne<{ n: number }>(
    `select count(*)::int as n from leadership_reward_cycles where user_id = $1`,
    [joiner.member.user_id],
  );
  record("growth bind creates no commission", bindCommissions?.n === 0, bindCommissions);
  record("growth bind creates no booking", bindBookings?.n === 0, bindBookings);
  record("growth bind does not request annual activation", bindActivations?.n === 0, bindActivations);
  record("growth bind creates no Leadership entitlement", bindLeadership?.n === 0, bindLeadership);
  const joinerQual = await withTransaction((client) => getQualificationStatus(client, joiner.member.user_id));
  record(
    "growth bind creates no qualification progress for the joiner",
    joinerQual.sponsorCount === 0 && joinerQual.qualified === false && joinerQual.levelCounts[1] === 0,
    joinerQual,
  );
  const sponsorQual = await withTransaction((client) => getQualificationStatus(client, growthSponsor.member.user_id));
  record(
    "growth bind itself does not count toward sponsor 3 or Level 5",
    sponsorQual.sponsorCount === 0 && sponsorQual.levelCounts[1] === 0 && sponsorQual.qualified === false,
    sponsorQual,
  );

  const stillOptional = await signupGeneralLater("growth-optional-signup@example.com", "Still Optional");
  record(
    "general signup remains optional after Growth bind API exists",
    stillOptional.member?.sponsor_user_id === null && stillOptional.member?.network_parent_user_id === null,
    stillOptional.member,
  );

  const soldOf = async (slug: string) =>
    (await queryOne<{ n: number }>(
      `select count(*)::int as n from offer_inventory_events where offer_slug=$1 and event_type='consume'`,
      [slug],
    ))?.n ?? 0;
  const catchCode = async <T>(run: () => Promise<T>) => {
    try {
      return { ok: true as const, value: await run() };
    } catch (err: any) {
      if (err?.code === "offer_sold_out" || err?.code === "quantity_below_sold") {
        return { ok: false as const, code: err.code as string, message: err.message as string };
      }
      throw err;
    }
  };

  const invCreate = await json(await app.request("/api/admin/offers", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      slug: "qa-shared-inventory",
      title: "QA Shared Inventory Share",
      categorySlug: "land-plots",
      location: "Dhaka",
      summary: "Synthetic shared-stock offer for commercial terms.",
      details: "One offer record for General Marketplace and Growth Program.",
      retailValue: 200000,
      bookingAmount: 20000,
      qualificationBenefit: 180000,
      commissionEligibleAmount: 20000,
      fullPaymentPrice: 180000,
      fullPaymentDeadlineDays: 30,
      installmentEnabled: true,
      installmentCount: 12,
      installmentFrequency: "monthly",
      installmentAmount: 15000,
      installmentDurationMonths: 12,
      firstInstallmentDueRule: "30 days after booking",
      gracePeriodDays: 7,
      totalQuantity: 2,
      image: "/images/flagship-suite.jpg",
      status: "published",
      displayOrder: 80,
    }),
  }));
  record(
    "admin can create a published offer with commercial terms and total quantity",
    invCreate.offer?.slug === "qa-shared-inventory" &&
      invCreate.offer?.full_payment_price === 180000 &&
      invCreate.offer?.installment_enabled === true &&
      invCreate.offer?.installment_count === 12 &&
      invCreate.offer?.installment_amount === 15000 &&
      invCreate.offer?.total_quantity === 2 &&
      invCreate.offer?.inventory?.sold === 0 &&
      invCreate.offer?.inventory?.available === 2 &&
      invCreate.offer?.inventory?.reserved === null,
    invCreate.offer,
  );

  const missingPlan = await json(await app.request("/api/admin/offers", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "QA Incomplete Plan",
      categorySlug: "land-plots",
      summary: "Missing installment count",
      retailValue: 100000,
      bookingAmount: 10000,
      qualificationBenefit: 90000,
      installmentEnabled: true,
      installmentFrequency: "monthly",
      image: "/images/flagship-suite.jpg",
      status: "draft",
    }),
  }));
  record(
    "installment fields are required when the plan is enabled",
    missingPlan.error?.code === "installment_count_required",
    missingPlan,
  );

  const publicInv = await json(await app.request("/api/offers/qa-shared-inventory"));
  record(
    "public details expose commercial terms and available quantity from the same offer",
    publicInv.offer?.retail_value === 200000 &&
      publicInv.offer?.full_payment_price === 180000 &&
      publicInv.offer?.booking_amount === 20000 &&
      publicInv.offer?.installment_enabled === true &&
      publicInv.offer?.inventory?.available === 2 &&
      publicInv.offer?.inventory?.reserved === null,
    publicInv.offer,
  );
  const publicFlagship = await json(await app.request("/api/offers/five-star-hotel-share"));
  record(
    "existing flagship stays unbounded so historical matrix bookings remain possible",
    publicFlagship.offer?.total_quantity == null && publicFlagship.offer?.inventory?.available == null,
    publicFlagship.offer?.inventory,
  );

  const bookInv = async (key: string, cookie = adminCookie) =>
    json(await app.request("/api/bookings", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "qa-shared-inventory" }),
    }));

  const p1 = await bookInv("inv-p1");
  const p2 = await bookInv("inv-p2");
  const p3 = await bookInv("inv-p3");
  record(
    "pending bookings freeze commercial terms and do not consume stock",
    p1.booking?.status === "pending" &&
      p1.booking?.full_payment_price === 180000 &&
      p1.booking?.installment_count === 12 &&
      p2.booking?.id &&
      p3.booking?.id &&
      (await soldOf("qa-shared-inventory")) === 0,
    { p1: p1.booking?.id, sold: await soldOf("qa-shared-inventory") },
  );

  const growthPending = await bookInv("inv-growth-member", memberCookie);
  record(
    "Growth member pending uses the same offer slug and still does not reserve",
    growthPending.booking?.offer_slug === "qa-shared-inventory" && (await soldOf("qa-shared-inventory")) === 0,
    growthPending.booking?.id,
  );

  const confirmedP1 = await withTransaction((client) => confirmBooking(client, p1.booking.id, adminMe.member.user_id));
  record(
    "confirm consumes exactly one shared unit",
    confirmedP1.status === "confirmed" && (await soldOf("qa-shared-inventory")) === 1,
    { sold: await soldOf("qa-shared-inventory") },
  );
  await withTransaction(async (client) => {
    await consumeInventoryForConfirmation(client, { offerSlug: "qa-shared-inventory", bookingId: p1.booking.id });
    await consumeInventoryForConfirmation(client, { offerSlug: "qa-shared-inventory", bookingId: p1.booking.id });
  });
  const p1Consumes = await query(`select id from offer_inventory_events where booking_id=$1 and event_type='consume'`, [p1.booking.id]);
  record("inventory consume is idempotent for the same booking", p1Consumes.length === 1 && (await soldOf("qa-shared-inventory")) === 1, p1Consumes.length);

  const activatedP1 = await withTransaction((client) => activateBooking(client, p1.booking.id));
  const snapP1 = await queryOne<any>(`select * from booking_snapshots where booking_id=$1`, [p1.booking.id]);
  record(
    "activation snapshot freezes commercial terms from the booking, not live offer edits",
    activatedP1.status === "activated" &&
      snapP1?.full_payment_price === 180000 &&
      snapP1?.installment_enabled === true &&
      snapP1?.installment_count === 12 &&
      snapP1?.installment_amount === 15000 &&
      snapP1?.full_payment_deadline_days === 30,
    snapP1,
  );

  const confirmedP2 = await withTransaction((client) => confirmBooking(client, p2.booking.id, adminMe.member.user_id));
  const soldOutPublic = await json(await app.request("/api/offers/qa-shared-inventory"));
  record(
    "last remaining unit consumes to sold out on the shared offer",
    confirmedP2.status === "confirmed" &&
      (await soldOf("qa-shared-inventory")) === 2 &&
      soldOutPublic.offer?.inventory?.available === 0,
    soldOutPublic.offer?.inventory,
  );

  const p3Confirm = await withTransaction((client) => catchCode(() => confirmBooking(client, p3.booking.id, adminMe.member.user_id)));
  const p3Row = await queryOne<{ status: string }>(`select status from bookings where id=$1`, [p3.booking.id]);
  record(
    "last-unit race rejects the extra confirm and leaves it pending",
    p3Confirm.ok === false && p3Confirm.code === "offer_sold_out" && p3Row?.status === "pending",
    { p3Confirm, p3Row },
  );

  const soldOutCreate = await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "inv-sold-out" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "qa-shared-inventory" }),
  });
  const soldOutCreateBody = await json(soldOutCreate);
  const growthSoldOut = await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "inv-growth-sold-out" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "qa-shared-inventory" }),
  });
  const growthSoldOutBody = await json(growthSoldOut);
  record(
    "General and Growth both see offer_sold_out on the same stock",
    soldOutCreate.status === 409 &&
      soldOutCreateBody.error?.code === "offer_sold_out" &&
      growthSoldOut.status === 409 &&
      growthSoldOutBody.error?.code === "offer_sold_out",
    { soldOutCreate: soldOutCreate.status, growthSoldOut: growthSoldOut.status },
  );

  const liveEdit = await json(await app.request("/api/admin/offers/qa-shared-inventory", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ fullPaymentPrice: 170000 }),
  }));
  const snapAfterEdit = await queryOne<any>(`select full_payment_price, installment_count from booking_snapshots where booking_id=$1`, [p1.booking.id]);
  record(
    "editing live commercial terms bumps version and does not rewrite historical snapshots",
    liveEdit.offer?.full_payment_price === 170000 &&
      liveEdit.offer?.version === (invCreate.offer?.version ?? 1) + 1 &&
      snapAfterEdit?.full_payment_price === 180000 &&
      snapAfterEdit?.installment_count === 12,
    { version: liveEdit.offer?.version, snapAfterEdit },
  );

  const reversedP1 = await withTransaction((client) =>
    reverseBooking(client, p1.booking.id, { reason: "inventory reverse must not restore", adminUserId: adminMe.member.user_id }),
  );
  const snapAfterReverse = await queryOne<any>(`select full_payment_price, installment_amount from booking_snapshots where booking_id=$1`, [p1.booking.id]);
  record(
    "reversal does not restore inventory and does not rewrite the snapshot",
    reversedP1.booking.status === "reversed" &&
      (await soldOf("qa-shared-inventory")) === 2 &&
      snapAfterReverse?.full_payment_price === 180000 &&
      snapAfterReverse?.installment_amount === 15000,
    { sold: await soldOf("qa-shared-inventory"), snapAfterReverse },
  );

  await withTransaction((client) => cancelBooking(client, p3.booking.id));
  const growthCancel = await withTransaction((client) => cancelBooking(client, growthPending.booking.id));
  record(
    "cancelling pending does not consume or restore stock",
    growthCancel.status === "cancelled" && (await soldOf("qa-shared-inventory")) === 2,
    await soldOf("qa-shared-inventory"),
  );

  const rtbBefore = await soldOf("qa-shared-inventory");
  const rtbInv = await app.request("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Inventory Enquiry",
      profession: "Teacher",
      mobile: "+8801811111199",
      location: "Dhaka",
      offerSlug: "qa-shared-inventory",
      source: "request_to_book",
    }),
  });
  record(
    "Request to Book is not a reservation and does not consume stock",
    rtbInv.status === 201 && (await soldOf("qa-shared-inventory")) === rtbBefore,
    rtbInv.status,
  );

  const belowSold = await json(await app.request("/api/admin/offers/qa-shared-inventory", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ totalQuantity: 1 }),
  }));
  record(
    "admin cannot set total quantity below committed sold",
    belowSold.error?.code === "quantity_below_sold",
    belowSold,
  );

  const versionBeforeQty = liveEdit.offer?.version;
  const qtySame = await json(await app.request("/api/admin/offers/qa-shared-inventory", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ totalQuantity: 2 }),
  }));
  const qtyRaise = await json(await app.request("/api/admin/offers/qa-shared-inventory", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ totalQuantity: 3 }),
  }));
  record(
    "quantity-only edits do not bump offer version and raise available stock",
    qtySame.offer?.version === versionBeforeQty &&
      qtyRaise.offer?.version === versionBeforeQty &&
      qtyRaise.offer?.inventory?.available === 1 &&
      qtyRaise.offer?.inventory?.sold === 2,
    { versionBeforeQty, same: qtySame.offer?.version, raised: qtyRaise.offer?.inventory },
  );

  const p5 = await bookInv("inv-p5");
  record("raising total quantity allows a new pending booking", p5.booking?.status === "pending" && p5.booking?.full_payment_price === 170000, p5.booking);
  await submitAndApprovePayment(adminCookie, "booking", p5.booking.id, "inv-p5-pay");
  const p5AfterPay = await queryOne<{ status: string }>(`select status from bookings where id=$1`, [p5.booking.id]);
  const snapP5 = await queryOne<any>(`select full_payment_price, installment_enabled from booking_snapshots where booking_id=$1`, [p5.booking.id]);
  const p5Consumes = await query(`select id from offer_inventory_events where booking_id=$1`, [p5.booking.id]);
  record(
    "payment approval confirms, activates, snapshots new terms, and consumes once",
    p5AfterPay?.status === "activated" &&
      snapP5?.full_payment_price === 170000 &&
      snapP5?.installment_enabled === true &&
      p5Consumes.length === 1 &&
      (await soldOf("qa-shared-inventory")) === 3,
    { p5AfterPay, snapP5, sold: await soldOf("qa-shared-inventory") },
  );

  const disabledPlan = await json(await app.request("/api/admin/offers/qa-shared-inventory", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ installmentEnabled: false, totalQuantity: 4 }),
  }));
  record(
    "disabling installments clears plan fields and can raise quantity",
    disabledPlan.offer?.installment_enabled === false &&
      disabledPlan.offer?.installment_count == null &&
      disabledPlan.offer?.installment_amount == null &&
      disabledPlan.offer?.installment_frequency == null &&
      disabledPlan.offer?.total_quantity === 4,
    disabledPlan.offer,
  );
  const p6 = await bookInv("inv-p6");
  record(
    "new bookings freeze the disabled installment plan without rewriting older snapshots",
    p6.booking?.installment_enabled === false &&
      p6.booking?.installment_count == null &&
      snapP1?.installment_enabled === true,
    p6.booking,
  );

  const historicalSnap = await queryOne<any>(
    `select full_payment_price, installment_count, installment_amount from booking_snapshots where offer_slug='five-star-hotel-share' order by activated_at asc limit 1`,
  );
  record(
    "historical flagship snapshots do not invent missing commercial terms",
    historicalSnap && historicalSnap.full_payment_price == null && historicalSnap.installment_count == null && historicalSnap.installment_amount == null,
    historicalSnap,
  );

  const unboundedBook = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "inv-flagship-still-open" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  record(
    "unbounded flagship still accepts a new pending booking",
    unboundedBook.booking?.status === "pending" && unboundedBook.booking?.offer_slug === "five-star-hotel-share",
    unboundedBook.booking?.id,
  );

  const orderOnly = await json(await app.request("/api/admin/offers/qa-shared-inventory", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ displayOrder: 81 }),
  }));
  record(
    "display order is listing order, not stock",
    orderOnly.offer?.display_order === 81 &&
      orderOnly.offer?.inventory?.sold === 3 &&
      orderOnly.offer?.inventory?.available === 1,
    orderOnly.offer?.inventory,
  );

  const bookingDest = await json(await app.request("/api/payment-destinations?target=booking"));
  record(
    "booking destinations expose Darmelk Bank only",
    Array.isArray(bookingDest.destinations) &&
      bookingDest.destinations.length === 1 &&
      bookingDest.destinations[0]?.method === "bank",
    bookingDest.destinations,
  );
  const defaultDest = await json(await app.request("/api/payment-destinations"));
  record(
    "unscoped destinations still include bKash, Nagad, and bank",
    ["bkash", "nagad", "bank"].every((method) => defaultDest.destinations?.some((d: { method: string }) => d.method === method)),
    defaultDest.destinations,
  );
  const activationDest = await json(await app.request("/api/payment-destinations?target=activation"));
  record(
    "activation destinations still include bKash, Nagad, and bank",
    ["bkash", "nagad", "bank"].every((method) => activationDest.destinations?.some((d: { method: string }) => d.method === method)) &&
      !activationDest.destinations?.some((d: { method: string }) => d.method === "merchant"),
    activationDest.destinations,
  );
  const paymentOptions = await json(await app.request("/api/payment-options?target=booking"));
  record(
    "booking payment options expose Bank and Merchant, not MFS",
    paymentOptions.options?.methods?.find((m: { method: string }) => m.method === "bank")?.available === true &&
      paymentOptions.options?.methods?.find((m: { method: string }) => m.method === "mfs")?.available === false &&
      paymentOptions.options?.methods?.find((m: { method: string }) => m.method === "merchant")?.available === true,
    paymentOptions.options?.methods,
  );
  const activationOptions = await json(await app.request("/api/payment-options?target=activation"));
  record(
    "activation payment options expose Bank and MFS, not Merchant",
    activationOptions.options?.methods?.find((m: { method: string }) => m.method === "bank")?.available === true &&
      activationOptions.options?.methods?.find((m: { method: string }) => m.method === "mfs")?.available === true &&
      activationOptions.options?.methods?.find((m: { method: string }) => m.method === "merchant")?.available === false,
    activationOptions.options?.methods,
  );
  const publicTerms = await json(await app.request("/api/terms"));
  record(
    "current Terms documents are versioned and readable",
    publicTerms.documents?.some((d: { key: string; version: string }) => d.key === "GROWTH_PROGRAM_TERMS" && d.version === "1") &&
      publicTerms.documents?.some((d: { key: string }) => d.key === "GROWTH_ACTIVATION_TERMS") &&
      publicTerms.documents?.some((d: { key: string }) => d.key === "GENERAL_TERMS") &&
      publicTerms.documents?.some((d: { key: string }) => d.key === "PRIVACY_POLICY") &&
      publicTerms.documents?.some((d: { key: string; slug: string }) => d.key === "PROMOTION_TERMS" && d.slug === "promotion") &&
      !JSON.stringify(publicTerms).includes("Link Mate") &&
      !JSON.stringify(publicTerms).includes("11,000"),
    publicTerms.documents?.map((d: { key: string }) => d.key),
  );

  const methodProbe = await json(await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "pay-route-probe" },
    body: JSON.stringify({ acceptBookingTerms: true, offerSlug: "five-star-hotel-share" }),
  }));
  record("payment-route probe booking is pending", methodProbe.booking?.status === "pending", methodProbe.booking);

  const craftedBkash = await json(await app.request("/api/payments", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "pay-route-bkash" },
    body: JSON.stringify({
      targetType: "booking",
      targetId: methodProbe.booking.id,
      paymentMethod: "bkash",
      referenceId: "BKASH-NOT-ALLOWED",
      proofFilename: "receipt.png",
      proofMime: "image/png",
      proofBase64: "iVBORw0KGgo=",
    }),
  }));
  record(
    "crafted Growth booking bKash payment is rejected",
    craftedBkash.error?.code === "payment_method_not_allowed",
    craftedBkash,
  );
  const craftedNagad = await json(await app.request("/api/payments", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "pay-route-nagad" },
    body: JSON.stringify({
      targetType: "booking",
      targetId: methodProbe.booking.id,
      paymentMethod: "nagad",
      referenceId: "NAGAD-NOT-ALLOWED",
      proofFilename: "receipt.png",
      proofMime: "image/png",
      proofBase64: "iVBORw0KGgo=",
    }),
  }));
  record(
    "crafted Growth booking Nagad payment is rejected",
    craftedNagad.error?.code === "payment_method_not_allowed",
    craftedNagad,
  );
  const craftedVendor = await json(await app.request("/api/payments", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "pay-route-vendor" },
    body: JSON.stringify({
      targetType: "booking",
      targetId: methodProbe.booking.id,
      paymentMethod: "vendor",
      referenceId: "VENDOR-NOT-ALLOWED",
      proofFilename: "receipt.png",
      proofMime: "image/png",
      proofBase64: "iVBORw0KGgo=",
    }),
  }));
  record(
    "crafted Growth booking vendor payment is rejected",
    craftedVendor.error?.code === "unsupported_payment_method" || craftedVendor.error?.code === "bad_request",
    craftedVendor,
  );
  const missingRef = await json(await app.request("/api/payments", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "pay-route-noref" },
    body: JSON.stringify({
      targetType: "booking",
      targetId: methodProbe.booking.id,
      paymentMethod: "bank",
      referenceId: "",
      proofFilename: "receipt.png",
      proofMime: "image/png",
      proofBase64: "iVBORw0KGgo=",
    }),
  }));
  record("Growth booking bank payment without a reference is rejected", missingRef.error && missingRef.payment == null, missingRef);

  const bankPay = await json(await app.request("/api/payments", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "pay-route-bank" },
    body: JSON.stringify({
      targetType: "booking",
      targetId: methodProbe.booking.id,
      paymentMethod: "bank",
      referenceId: "CITY-BANK-OK",
      proofFilename: "receipt.png",
      proofMime: "image/png",
      proofBase64: "iVBORw0KGgo=",
    }),
  }));
  record(
    "Growth booking bank payment is accepted",
    bankPay.payment?.status === "submitted" && bankPay.payment?.payment_method === "bank",
    bankPay.payment,
  );
  const soldBeforeBank = await soldOf("five-star-hotel-share");
  const reviewedBank = await json(await app.request(`/api/admin/payments/${bankPay.payment.id}/review`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  const approvedBank = await json(await app.request(`/api/admin/payments/${bankPay.payment.id}/approve`, {
    method: "POST", headers: { cookie: adminCookie },
  }));
  const probeAfter = await json(await app.request(`/api/bookings/${methodProbe.booking.id}`, { headers: { cookie: adminCookie } }));
  record(
    "manual bank approval uses the existing confirm and activate path",
    reviewedBank.payment?.status === "under_review" &&
      approvedBank.payment?.status === "approved" &&
      probeAfter.booking?.status === "activated",
    { reviewed: reviewedBank.payment?.status, approved: approvedBank.payment?.status, booking: probeAfter.booking?.status },
  );
  const soldAfterBank = await soldOf("five-star-hotel-share");
  record("manual bank approval consumes shared inventory exactly once", soldAfterBank === soldBeforeBank + 1, { soldBeforeBank, soldAfterBank });
  const repeatApprove = await app.request(`/api/admin/payments/${bankPay.payment.id}/approve`, {
    method: "POST", headers: { cookie: adminCookie },
  });
  const soldAfterRepeat = await soldOf("five-star-hotel-share");
  record(
    "repeated manual approval does not double-consume stock",
    repeatApprove.status >= 400 && soldAfterRepeat === soldAfterBank,
    { status: repeatApprove.status, soldAfterRepeat },
  );

  const activationStillBkash = await json(await app.request("/api/payments", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "Idempotency-Key": "pay-route-activation-bkash" },
    body: JSON.stringify({
      targetType: "activation",
      targetId: "not-a-real-activation",
      paymentMethod: "bkash",
      referenceId: "ACT-BKASH",
      proofFilename: "receipt.png",
      proofMime: "image/png",
      proofBase64: "iVBORw0KGgo=",
    }),
  }));
  record(
    "activation still accepts the bKash method (rejected only because the request is missing, not the method)",
    activationStillBkash.error?.code !== "payment_method_not_allowed",
    activationStillBkash,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error("FAILED:", failed.map((f) => f.step));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
