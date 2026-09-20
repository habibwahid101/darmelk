function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0] ?? "";
}

async function main() {
  process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS || "admin@example.com";
  const { app } = await import("./router.js");
  const { registerPrelaunchResetRoutes } = await import("./engine/prelaunch-reset-http.js");
  registerPrelaunchResetRoutes(app);
  const { query, withTransaction } = await import("./db.js");
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
  const memberCookie = extractCookie(memberSignIn);
  record("prelaunch smoke can reuse smoke-test identities", adminSignIn.status === 200 && memberSignIn.status === 200, {
    admin: adminSignIn.status,
    member: memberSignIn.status,
  });

  await runPrelaunchResetSmoke({
    app,
    query,
    withTransaction,
    adminCookie,
    memberCookie,
    record,
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
