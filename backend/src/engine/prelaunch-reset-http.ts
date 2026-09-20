import type { Hono } from "hono";
import { withTransaction } from "../db.js";
import { requireAdmin } from "./members.js";
import { previewPrelaunchReset } from "./prelaunch-reset.js";

type Vars = { userId: string; userEmail: string };

/** Temporary admin-only preview. SELECT only. No execute/delete route. */
export function registerPrelaunchResetPreview(app: Hono<{ Variables: Vars }>) {
  app.get("/api/admin/maintenance/prelaunch-reset/preview", async (c) => {
    const adminId = c.get("userId");
    const preview = await withTransaction(async (client) => {
      await requireAdmin(client, adminId);
      return previewPrelaunchReset(client);
    });
    return c.json(preview);
  });
}
