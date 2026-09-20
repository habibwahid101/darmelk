import type { Hono } from "hono";
import { query, queryOne, withTransaction } from "./db.js";
import {
  RESET_CONFIRMATION,
  executePrelaunchReset,
  previewPrelaunchReset,
} from "./engine/prelaunch-reset.js";

type RecordFn = (step: string, ok: boolean, detail?: unknown) => void;

export async function runPrelaunchResetSmoke(opts: {
  app: Hono;
  adminCookie: string;
  rootCookie: string;
  adminUserId: string;
  record: RecordFn;
  soldOf: (slug: string) => Promise<number>;
}): Promise<void> {
  process.env.DARMELK_PRELAUNCH_RESET_TEST = "1";
  const { app, adminCookie, rootCookie, adminUserId, record, soldOf } = opts;
  const json = async (res: Response): Promise<any> => res.json();

  const guestPreview = await app.request("/api/admin/maintenance/prelaunch-reset/preview");
  record("preview endpoint is admin-only", guestPreview.status === 401, guestPreview.status);
  const guestExecute = await app.request("/api/admin/maintenance/prelaunch-reset/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation: RESET_CONFIRMATION }),
  });
  record("execute endpoint is admin-only", guestExecute.status === 401, guestExecute.status);

  const memberPreview = await app.request("/api/admin/maintenance/prelaunch-reset/preview", {
    headers: { cookie: rootCookie },
  });
  record("preview rejects non-admin session", memberPreview.status === 403, memberPreview.status);

  const wrongConfirm = await json(
    await app.request("/api/admin/maintenance/prelaunch-reset/execute", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "wrong" }),
    }),
  );
  record("wrong confirmation is rejected", wrongConfirm.error?.code === "confirmation_required", wrongConfirm);

  await query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('orphan-auth-only', 'Orphan Auth', 'orphan-auth-only@example.com', false, now(), now())
     on conflict (id) do nothing`,
  );
  const beforeProbe = await withTransaction((client) => previewPrelaunchReset(client));
  const bookingsBefore = beforeProbe.reset_sensitive_counts.bookings ?? 0;
  const offersBefore = beforeProbe.preserve_catalog_counts.offers ?? 0;
  const migrationsBefore = beforeProbe.preserve_catalog_counts._migrations ?? 0;
  record("reset preview sees prelaunch data and catalog", bookingsBefore > 0 && offersBefore >= 1 && migrationsBefore >= 1, {
    bookingsBefore,
    offersBefore,
    migrationsBefore,
    authOnly: beforeProbe.auth_only_non_admin_users,
  });

  let rolledBack = false;
  try {
    await withTransaction((client) =>
      executePrelaunchReset(client, {
        adminUserId,
        confirmation: RESET_CONFIRMATION,
        abortAfterClear: true,
      }),
    );
  } catch (err) {
    rolledBack = (err as Error).message === "test_rollback_probe";
  }
  const afterProbe = await withTransaction((client) => previewPrelaunchReset(client));
  record(
    "transaction rolls back when reset is aborted",
    rolledBack && (afterProbe.reset_sensitive_counts.bookings ?? 0) === bookingsBefore,
    { rolledBack, bookingsAfterAbort: afterProbe.reset_sensitive_counts.bookings },
  );

  const executed = await json(
    await app.request("/api/admin/maintenance/prelaunch-reset/execute", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ confirmation: RESET_CONFIRMATION }),
    }),
  );
  record(
    "execute clears prelaunch data and keeps admin plus catalog",
    executed.ok === true &&
      executed.after.non_admin_members === 0 &&
      executed.after.auth_only_non_admin_users === 0 &&
      executed.after.flagship_sold === 0 &&
      executed.after.admin_members >= 1 &&
      executed.after.reset_audit_count === 1 &&
      executed.after.preserve_catalog_counts.offers === offersBefore &&
      executed.after.preserve_catalog_counts._migrations === migrationsBefore &&
      (executed.after.reset_sensitive_counts.bookings ?? 1) === 0 &&
      (executed.after.reset_sensitive_counts.commission_ledger ?? 1) === 0,
    executed.after,
  );

  const adminStill = await json(await app.request("/api/me", { headers: { cookie: adminCookie } }));
  record(
    "admin auth and account survive reset",
    adminStill.member?.role === "admin" && adminStill.member?.user_id === adminUserId,
    adminStill.member,
  );
  const orphanGone = await queryOne<{ n: number }>(`select count(*)::int as n from "user" where id = 'orphan-auth-only'`);
  record("auth-only non-admin user is removed", (orphanGone?.n ?? 1) === 0, orphanGone);
  const leftoverMembers = await queryOne<{ n: number }>(`select count(*)::int as n from members where role <> 'admin'`);
  record("non-admin members are removed", (leftoverMembers?.n ?? 1) === 0, leftoverMembers);
  const soldAfterReset = await soldOf("five-star-hotel-share");
  record("flagship sold becomes 0", soldAfterReset === 0, { soldAfterReset });
  const audit = await queryOne<{ n: number }>(
    `select count(*)::int as n from admin_actions where action_type = 'ONE_TIME_PRELAUNCH_RESET'`,
  );
  record("one reset audit record remains", (audit?.n ?? 0) === 1, audit);

  const second = await json(
    await app.request("/api/admin/maintenance/prelaunch-reset/execute", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ confirmation: RESET_CONFIRMATION }),
    }),
  );
  record("second execution is refused", second.error?.code === "already_clean", second);
}
