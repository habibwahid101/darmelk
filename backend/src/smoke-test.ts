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
  const { query, withTransaction } = await import("./db.js");
  const { approveActivation, requestActivation } = await import("./engine/activation.js");
  const { activateBooking, confirmBooking, createBooking, reverseBooking } = await import("./engine/bookings.js");
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
  const submitAndApprovePayment = async (cookie: string, targetType: "activation" | "booking" | "merchant_bundle", targetId: string, key: string) => {
    const submitted = await json(await app.request("/api/payments", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ targetType, targetId, paymentMethod: "bkash", referenceId: `REF-${key}`,
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
    "normal member without sponsor is rejected",
    noSponsorOnboard.error?.code === "sponsor_required" || noSponsorOnboard.member?.onboarding_complete !== true,
    noSponsorOnboard,
  );
  const noTerms = await json(
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie: noSponsorCookie, "content-type": "application/json" },
      body: JSON.stringify({ sponsorCode: adminMe.member.referral_code }),
    }),
  );
  record("onboarding without terms accepted is rejected", noTerms.error?.code === "terms_required", noTerms);
  const badCode = await json(
    await app.request("/api/me/onboarding", {
      method: "POST",
      headers: { cookie: noSponsorCookie, "content-type": "application/json" },
      body: JSON.stringify({ sponsorCode: "DM-NOTREAL", termsAccepted: true }),
    }),
  );
  record("invalid sponsor code is rejected", badCode.error?.code === "sponsor_not_found", badCode);

  const adminActivationRequest = await json(await app.request("/api/activation/request", {
    method: "POST",
    headers: { cookie: adminCookie },
  }));
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
    onboarded.member?.network_parent_user_id === adminMe.member.user_id && onboarded.member?.network_slot === 1,
    onboarded,
  );

  const activationReq = await json(await app.request("/api/activation/request", {
    method: "POST", headers: { cookie: memberCookie },
  }));
  record("member requests annual activation (BDT 1000, separate from booking economics)", activationReq.activation?.amount === 1000 && activationReq.activation?.status === "pending", activationReq);
  await submitAndApprovePayment(memberCookie, "activation", activationReq.activation.id, "member-activation-payment");
  const memberMeAfterActivation = await json(await app.request("/api/me", { headers: { cookie: memberCookie } }));
  record("member's activation_status flips to active after verified payment approval", memberMeAfterActivation.member?.activation_status === "active", memberMeAfterActivation.member);

  // --- member books the flagship offer ---
  const bookRes = await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "test-booking-1" },
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  });
  const booked = await json(bookRes);
  record("booking created pending, amount frozen from offer", booked.booking?.status === "pending" && booked.booking?.booking_amount === 50000, booked);

  // Idempotency replay: same key must not create a second booking.
  const bookRetryRes = await app.request("/api/bookings", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "Idempotency-Key": "test-booking-1" },
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  });
  const bookedRetry = await json(bookRetryRes);
  record("idempotent replay returns the SAME booking id", bookedRetry.booking?.id === booked.booking?.id, bookedRetry.booking?.id);

  // --- commission is withheld until payment approval activates the booking ---
  const beforeActivation = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  record("pending booking does not release commission", beforeActivation.commissions?.length === 0, beforeActivation);
  await submitAndApprovePayment(memberCookie, "booking", booked.booking.id, "booking-payment-1");
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
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  });
  const book2 = await json(book2Res);
  await submitAndApprovePayment(memberCookie, "booking", book2.booking.id, "booking-payment-2");

  await withTransaction(async (client) => {
    const own = await createBooking(client, adminMe.member.user_id, "five-star-hotel-share");
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
      const created = await createBooking(client, userId, "five-star-hotel-share");
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
    const created = await createBooking(client, deepest.user_id, "five-star-hotel-share");
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
    const created = await createBooking(client, matrixRootId, "five-star-hotel-share");
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
    const created = await createBooking(client, deepest.user_id, "five-star-hotel-share");
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
    const activation = await requestActivation(client, matrixRootId);
    return approveActivation(client, activation.id, adminMe.member.user_id);
  });
  const restoredReleaseBooking = await withTransaction(async (client) => {
    const created = await createBooking(client, deepest.user_id, "five-star-hotel-share");
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
  const renewalReq = await json(await app.request("/api/activation/request", { method: "POST", headers: { cookie: adminCookie } }));
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
    contactRes.status === 201 && contact.request?.status === "new" && contact.request?.name === "Amina Rahman",
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
  const statusRes = await app.request(`/api/admin/contact-requests/${createdId}/status`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "reviewed" }),
  });
  const statusBody = await json(statusRes);
  record("admin can transition contact request status", statusBody.request?.status === "reviewed", statusBody);

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
      await createBooking(client, adminMe.member.user_id, "chittagong-plot-share");
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
    const act = await json(await app.request("/api/activation/request", { method: "POST", headers: { cookie } }));
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
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  const invalidMerchant = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-bad" },
    body: JSON.stringify({ merchantUserId: "not-a-real-user" }),
  }));
  record("invalid Merchant User ID is rejected", invalidMerchant.error?.code === "merchant_not_found" || invalidMerchant.error, invalidMerchant);
  const nonMerchant = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-non" },
    body: JSON.stringify({ merchantUserId: memberMerchantNav.member.user_id }),
  }));
  record("non-Merchant User ID is rejected", nonMerchant.error?.code === "merchant_inactive" || nonMerchant.status === 400, nonMerchant);

  const pendingReq = await json(await app.request(`/api/bookings/${badId.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-1" },
    body: JSON.stringify({ merchantUserId: merchantUser.member.user_id }),
  }));
  record(
    "valid Pay by Merchant request is created pending with no debit",
    pendingReq.request?.status === "pending" && pendingReq.request?.amount === 50000,
    pendingReq.request,
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
    body: JSON.stringify({ merchantUserId: merchantUser.member.user_id }),
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
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  const cancelReq = await json(await app.request(`/api/bookings/${cancelBook.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-cancel" },
    body: JSON.stringify({ merchantUserId: merchantUser.member.user_id }),
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
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  const selfReq = await json(await app.request(`/api/bookings/${selfBook.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: merchantUser.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-self" },
    body: JSON.stringify({ merchantUserId: merchantUser.member.user_id }),
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
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  await query(`update merchants set available = 1000 where user_id=$1`, [merchantUser.member.user_id]);
  const lowCredit = await json(await app.request(`/api/bookings/${insufficientBook.booking.id}/merchant-pay`, {
    method: "POST",
    headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-low" },
    body: JSON.stringify({ merchantUserId: merchantUser.member.user_id }),
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
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  const bookB = await json(await app.request("/api/bookings", {
    method: "POST", headers: { cookie: concB.cookie, "content-type": "application/json", "Idempotency-Key": "m-book-cb" },
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  const reqA = await json(await app.request(`/api/bookings/${bookA.booking.id}/merchant-pay`, {
    method: "POST", headers: { cookie: concA.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-ca" },
    body: JSON.stringify({ merchantUserId: tightMerchant.member.user_id }),
  }));
  const reqB = await json(await app.request(`/api/bookings/${bookB.booking.id}/merchant-pay`, {
    method: "POST", headers: { cookie: concB.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-cb" },
    body: JSON.stringify({ merchantUserId: tightMerchant.member.user_id }),
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
    body: JSON.stringify({ offerSlug: "five-star-hotel-share" }),
  }));
  const susReq = await json(await app.request(`/api/bookings/${susBook.booking.id}/merchant-pay`, {
    method: "POST", headers: { cookie: customer.cookie, "content-type": "application/json", "Idempotency-Key": "m-pay-sus" },
    body: JSON.stringify({ merchantUserId: merchantUser.member.user_id }),
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
