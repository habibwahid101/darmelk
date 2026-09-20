import type { Hono } from "hono";
import { withTransaction } from "../db.js";
import { requireAdmin } from "./members.js";
import { executePrelaunchReset, previewPrelaunchReset } from "./prelaunch-reset.js";

type Vars = { userId: string; userEmail: string };

/** Temporary admin-only one-time prelaunch reset preview + execute. */
export function registerPrelaunchResetRoutes(app: Hono<{ Variables: Vars }>) {
  app.get("/api/admin/maintenance/prelaunch-reset/preview", async (c) => {
    const adminId = c.get("userId");
    const preview = await withTransaction(async (client) => {
      await requireAdmin(client, adminId);
      return previewPrelaunchReset(client);
    });
    return c.json(preview);
  });

  app.post("/api/admin/maintenance/prelaunch-reset/execute", async (c) => {
    const adminId = c.get("userId");
    let body: { confirmation?: unknown } = {};
    try {
      body = (await c.req.json()) as { confirmation?: unknown };
    } catch {
      body = {};
    }
    const result = await withTransaction(async (client) => {
      await requireAdmin(client, adminId);
      return executePrelaunchReset(client, { adminUserId: adminId, confirmation: body.confirmation });
    });
    return c.json(result);
  });
}

/** @deprecated Use registerPrelaunchResetRoutes */
export const registerPrelaunchResetPreview = registerPrelaunchResetRoutes;
