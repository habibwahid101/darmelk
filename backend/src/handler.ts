import { handle } from "hono/aws-lambda";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { app } from "./router.js";
import { runMigrations, describeSchema } from "./migrate.js";

const httpHandler = handle(app);

type MaintenanceEvent = { action: "migrate" | "health" | "describe" };
type MaintenanceResult = {
  ok: boolean;
  applied?: string[];
  error?: string;
  database?: string;
  tables?: string[];
};

function isMaintenanceEvent(event: unknown): event is MaintenanceEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "action" in event &&
    typeof (event as { action: unknown }).action === "string" &&
    !("requestContext" in event)
  );
}

export const handler = async (
  event: APIGatewayProxyEventV2 | MaintenanceEvent,
  context: Context,
): Promise<APIGatewayProxyResultV2 | MaintenanceResult> => {
  if (isMaintenanceEvent(event)) {
    if (event.action === "migrate") {
      try {
        const result = await runMigrations();
        console.log("[migrate] applied:", result.applied);
        return { ok: true, applied: result.applied };
      } catch (err) {
        console.error("[migrate] failed", err);
        return { ok: false, error: (err as Error).message };
      }
    }
    if (event.action === "health") {
      return { ok: true };
    }
    if (event.action === "describe") {
      try {
        const result = await describeSchema();
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }
    return { ok: false, error: `unknown action: ${event.action}` };
  }
  return httpHandler(event as unknown as Parameters<typeof httpHandler>[0], context) as Promise<APIGatewayProxyResultV2>;
};
