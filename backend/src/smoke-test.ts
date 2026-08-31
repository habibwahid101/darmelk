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
  const json = async (res: Response): Promise<any> => res.json();
  const results: Array<{ step: string; ok: boolean; detail?: unknown }> = [];
  const record = (step: string, ok: boolean, detail?: unknown) => {
    results.push({ step, ok, detail });
    console.log(ok ? "PASS" : "FAIL", step, detail ?? "");
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
    body: JSON.stringify({ phone: "+8801000000000", sponsorCode: adminMe.member.referral_code }),
  });
  const onboarded = await json(onboardRes);
  record(
    "member onboarding places into matrix under admin",
    onboarded.member?.network_parent_user_id === adminMe.member.user_id && onboarded.member?.network_slot === 1,
    onboarded,
  );

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

  // --- admin confirms the booking -> should post a L1 commission (10% of 50000 = 5000) to admin ---
  const confirmRes = await app.request(`/api/admin/bookings/${booked.booking.id}/confirm`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  const confirmed = await json(confirmRes);
  record("admin confirms booking", confirmed.booking?.status === "confirmed", confirmed);

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
  record("qualification not yet met (1 of 3 sponsors)", qual.qualification?.sponsorCount === 0 && qual.qualification?.qualified === false, qual.qualification);
  // Note: sponsorCount counts ACTIVATED sponsees only — member1 isn't activated yet, so 0 is correct here.

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
      body: JSON.stringify({ phone: `+88010000000${n}`, sponsorCode: adminMe.member.referral_code }),
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

  // --- annual activation request + admin approval ---
  const activationReqRes = await app.request("/api/activation/request", {
    method: "POST",
    headers: { cookie: memberCookie },
  });
  const activationReq = await json(activationReqRes);
  record("member requests annual activation (BDT 1000, separate from booking economics)", activationReq.activation?.amount === 1000 && activationReq.activation?.status === "pending", activationReq);

  const approveRes = await app.request(`/api/admin/activations/${activationReq.activation.id}/approve`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  const approved = await json(approveRes);
  record("admin approves activation -> member becomes active", approved.activation?.status === "active", approved);

  const memberMeAfterActivation = await json(await app.request("/api/me", { headers: { cookie: memberCookie } }));
  record("member's activation_status flips to active on the member row", memberMeAfterActivation.member?.activation_status === "active", memberMeAfterActivation.member);

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
  await app.request(`/api/admin/bookings/${book2.booking.id}/confirm`, { method: "POST", headers: { cookie: adminCookie } });

  const withdrawRes = await app.request("/api/withdrawals", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 5000 }),
  });
  const withdrawal = await json(withdrawRes);
  record("withdrawal requested against available commission balance", withdrawal.withdrawal?.status === "requested" && withdrawal.withdrawal?.amount === 5000, withdrawal);

  const overWithdrawRes = await app.request("/api/withdrawals", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ amount: 999999 }),
  });
  record("withdrawal exceeding available balance is rejected (409)", overWithdrawRes.status === 409);

  const approveWdRes = await app.request(`/api/admin/withdrawals/${withdrawal.withdrawal.id}/approve`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  const approveWd = await json(approveWdRes);
  const paidRes = await app.request(`/api/admin/withdrawals/${withdrawal.withdrawal.id}/mark-paid`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  const paid = await json(paidRes);
  record("withdrawal approved then marked paid", approveWd.withdrawal?.status === "approved" && paid.withdrawal?.status === "paid", paid);

  const commissionsAfterPay = await json(await app.request("/api/me/commissions", { headers: { cookie: adminCookie } }));
  const paidCommission = commissionsAfterPay.commissions.find((cm: { source_booking_id: string }) => cm.source_booking_id === book2.booking.id);
  record("the commission backing the paid withdrawal flipped to status=paid (not deleted)", paidCommission?.status === "paid", paidCommission);

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
