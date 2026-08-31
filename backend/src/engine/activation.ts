// Annual activation (BDT 1,000) — financially separate from booking
// economics. A member must be "active" for their sponsees to count toward a
// sponsor's qualification (see engine/network.ts getEligibleSponsorCount).
import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";

const ACTIVATION_FEE = 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export type AnnualActivation = {
  id: string;
  user_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status: "pending" | "active" | "expired" | "rejected";
  requested_at: string;
  decided_at: string | null;
  decided_by_admin_id: string | null;
};

export async function requestActivation(client: PoolClient, userId: string): Promise<AnnualActivation> {
  await client.query(
    `update members set activation_status = 'expired', updated_at = now()
      where user_id = $1 and activation_status = 'active'
        and activation_expires_at is not null and activation_expires_at <= now()`,
    [userId],
  );
  await client.query(
    `update annual_activations set status = 'expired'
      where user_id = $1 and status = 'active' and period_end <= now()`,
    [userId],
  );
  const { rows: memberRows } = await client.query<{ activation_status: string }>(
    `select activation_status from members where user_id = $1 for update`,
    [userId],
  );
  if (!memberRows[0]) throw notFound("Member not found");
  if (memberRows[0].activation_status === "active" || memberRows[0].activation_status === "pending") {
    throw conflict(`Activation already ${memberRows[0].activation_status}`);
  }

  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + YEAR_MS);
  const id = uid("act");
  const { rows } = await client.query<AnnualActivation>(
    `insert into annual_activations (id, user_id, amount, period_start, period_end, status)
     values ($1, $2, $3, $4, $5, 'pending')
     returning *`,
    [id, userId, ACTIVATION_FEE, periodStart.toISOString(), periodEnd.toISOString()],
  );
  await client.query(`update members set activation_status = 'pending', updated_at = now() where user_id = $1`, [
    userId,
  ]);
  return rows[0]!;
}

export async function approveActivation(
  client: PoolClient,
  activationId: string,
  adminUserId: string,
): Promise<AnnualActivation> {
  const { rows } = await client.query<AnnualActivation>(`select * from annual_activations where id = $1 for update`, [
    activationId,
  ]);
  const activation = rows[0];
  if (!activation) throw notFound("Activation request not found");
  if (activation.status !== "pending") throw conflict(`Activation is ${activation.status}, expected pending`);

  const { rows: updated } = await client.query<AnnualActivation>(
    `update annual_activations set status = 'active', decided_at = now(), decided_by_admin_id = $2 where id = $1 returning *`,
    [activationId, adminUserId],
  );
  await client.query(
    `update members set activation_status = 'active', activation_expires_at = $2, updated_at = now() where user_id = $1`,
    [activation.user_id, activation.period_end],
  );
  return updated[0]!;
}

export async function rejectActivation(
  client: PoolClient,
  activationId: string,
  adminUserId: string,
): Promise<AnnualActivation> {
  const { rows } = await client.query<AnnualActivation>(`select * from annual_activations where id = $1 for update`, [
    activationId,
  ]);
  const activation = rows[0];
  if (!activation) throw notFound("Activation request not found");
  if (activation.status !== "pending") throw conflict(`Activation is ${activation.status}, expected pending`);

  const { rows: updated } = await client.query<AnnualActivation>(
    `update annual_activations set status = 'rejected', decided_at = now(), decided_by_admin_id = $2 where id = $1 returning *`,
    [activationId, adminUserId],
  );
  await client.query(`update members set activation_status = 'inactive', updated_at = now() where user_id = $1`, [
    activation.user_id,
  ]);
  return updated[0]!;
}

export function assertValidAmount(amount: unknown): asserts amount is number {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw badRequest("Invalid amount", "invalid_amount");
  }
}
