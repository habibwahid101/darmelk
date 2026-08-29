// Idempotency for mutating endpoints: a client sends an `Idempotency-Key`
// header; a retried request with the same key replays the first response
// instead of re-running the operation. This is a best-effort guard against
// double-submits (flaky networks, double-clicks, retried Lambda invokes) —
// the real backstop against double-crediting money is the DB-level unique
// constraint on commission_ledger (source_booking_id, beneficiary_user_id,
// level), which holds even without a client sending this header.
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { conflict } from "./errors.js";

export async function withIdempotency<T>(
  client: PoolClient,
  opts: { key: string | undefined; endpoint: string; userId: string | undefined; requestBody: unknown },
  run: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {
  if (!opts.key) {
    const result = await run();
    return { ...result, replayed: false };
  }

  const requestHash = createHash("sha256").update(JSON.stringify(opts.requestBody ?? {})).digest("hex");

  const { rows } = await client.query<{ response_status: number; response_body: T; request_hash: string }>(
    `select response_status, response_body, request_hash from idempotency_keys where key = $1 and endpoint = $2`,
    [opts.key, opts.endpoint],
  );
  const existing = rows[0];
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw conflict("Idempotency-Key reused with a different request body");
    }
    return { status: existing.response_status, body: existing.response_body, replayed: true };
  }

  const result = await run();
  await client.query(
    `insert into idempotency_keys (key, endpoint, user_id, request_hash, response_status, response_body)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (key, endpoint) do nothing`,
    [opts.key, opts.endpoint, opts.userId ?? null, requestHash, result.status, JSON.stringify(result.body)],
  );
  return { ...result, replayed: false };
}
