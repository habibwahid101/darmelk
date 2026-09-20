function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0] ?? "";
}

async function main() {
  process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS || "admin@example.com";
  process.env.DARMELK_PRELAUNCH_RESET_TEST = "1";
  const { app } = await import("./router.js");
  const { registerPrelaunchResetRoutes } = await import("./engine/prelaunch-reset-http.js");
  registerPrelaunchResetRoutes(app);
  const { runPrelaunchResetSmoke } = await import("./prelaunch-reset-smoke.js");

  const results: Array<{ step: string; ok: boolean; detail?: unknown }> = [];
  const record = (step: string, ok: boolean, detail?: unknown) => {
    results.push({ step, ok, detail });
    console.log(ok ? "PASS" : "FAIL", step, detail ?? "");
  };

  const adminSignIn = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "password123" }),
  });
  const memberSignIn = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "root-no-sponsor@example.com", password: "password123" }),
  });
  const adminCookie = extractCookie(adminSignIn);
  const rootCookie = extractCookie(memberSignIn);
  const me = await adminSignIn.json().catch(async () => (await app.request("/api/me", { headers: { cookie: adminCookie } })).json());
  const meLive = await (await app.request("/api/me", { headers: { cookie: adminCookie } })).json();
  const soldOf = async (slug: string) => {
    const preview = await (await app.request("/api/admin/maintenance/prelaunch-reset/preview", { headers: { cookie: adminCookie } })).json();
    return slug === preview.flagship?.slug ? Number(preview.flagship?.sold ?? 0) : 0;
  };
  record("prelaunch smoke can reuse smoke-test identities", adminSignIn.status === 200 && memberSignIn.status === 200 && Boolean(meLive.member?.user_id), {
    admin: adminSignIn.status,
    member: memberSignIn.status,
  });
  await runPrelaunchResetSmoke({
    app,
    adminCookie,
    rootCookie,
    adminUserId: meLive.member.user_id,
    record,
    soldOf,
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} prelaunch reset checks passed`);
  if (failed.length) {
    console.error("FAILED:", failed.map((f) => f.step));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("prelaunch reset smoke crashed:", err);
  process.exit(1);
});
