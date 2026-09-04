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
  const json = async (res: Response): Promise<any> => res.json();
  const results: Array<{ step: string; ok: boolean; detail?: unknown }> = [];
  const record = (step: string, ok: boolean, detail?: unknown) => {
    results.push({ step, ok, detail });
    console.log(ok ? "PASS" : "FAIL", step, detail ?? "");
  };
  const submitAndApprovePayment = async (cookie: string, targetType: "activation" | "booking", targetId: string, key: string) => {
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

  const overWithdrawRes = await app.request("/api/withdrawals", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 999999, payoutMethodId: payoutMethod.method.id }),
  });
  record("withdrawal exceeding available balance is rejected (409)", overWithdrawRes.status === 409);

  const approveWdRes = await app.request(`/api/admin/withdrawals/${withdrawal.withdrawal.id}/approve`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  const approveWd = await json(approveWdRes);
  const paidRes = await app.request(`/api/admin/withdrawals/${withdrawal.withdrawal.id}/mark-paid`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ paymentReference: "QA-PAYOUT-001" }),
  });
  const paid = await json(paidRes);
  record("withdrawal approved then marked paid", approveWd.withdrawal?.status === "approved" && paid.withdrawal?.status === "paid", paid);

  const commissionsAfterPay = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  const paidCommission = commissionsAfterPay.commissions.find((cm: { source_booking_id: string }) => cm.source_booking_id === book2.booking.id);
  record("the commission backing the paid withdrawal flipped to status=paid (not deleted)", paidCommission?.status === "paid", paidCommission);

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
    await client.query(`update members set sponsor_user_id=$1 where user_id like 'darmelk_qa_matrix_%' and user_id <> 'darmelk_qa_matrix_364'`, [matrixRootId]);
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
