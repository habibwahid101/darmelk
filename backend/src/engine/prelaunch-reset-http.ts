import type { Hono } from "hono";
import { withTransaction } from "../db.js";
import { badRequest } from "../errors.js";
import { requireAdmin } from "./members.js";
import {
  RESET_CONFIRMATION,
  assertResetEnvironment,
  executePrelaunchReset,
  previewPrelaunchReset,
} from "./prelaunch-reset.js";

type Vars = { userId: string; userEmail: string };

/** Temporary admin-only prelaunch reset. Preview is SELECT only. Execute is one-shot. */
export function registerPrelaunchResetPreview(app: Hono<{ Variables: Vars }>) {
  app.get("/api/admin/maintenance/prelaunch-reset/preview", async (c) => {
    const adminId = c.get("userId");
    const preview = await withTransaction(async (client) => {
      await requireAdmin(client, adminId);
      return previewPrelaunchReset(client);
    });
    return c.json(preview);
  });

  app.post("/api/admin/maintenance/prelaunch-reset/execute", async (c) => {
    assertResetEnvironment();
    const adminId = c.get("userId");
    let body: { confirmation?: unknown } = {};
    try {
      body = (await c.req.json()) as { confirmation?: unknown };
    } catch {
      body = {};
    }
    if (body.confirmation !== RESET_CONFIRMATION) {
      throw badRequest("Type the exact confirmation phrase to continue", "confirmation_required");
    }
    const result = await withTransaction(async (client) => {
      await requireAdmin(client, adminId);
      return executePrelaunchReset(client, {
        adminUserId: adminId,
        confirmation: RESET_CONFIRMATION,
      });
    });
    return c.json(result);
  });
}
