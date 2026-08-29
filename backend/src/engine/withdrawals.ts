// Withdrawals: a member requests a payout against their AVAILABLE commission
// balance. Nothing is deducted from the ledger on request — only on admin
// approval, and even then by marking commission rows 'paid' rather than
// deleting anything, so the full history stays intact.
import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { getCommissionTotals } from "./commissions.js";

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  status: "requested" | "approved" | "rejected" | "paid";
  requested_at: string;
  decided_at: string | null;
  decided_by_admin_id: string | null;
  paid_at: string | null;
  notes: string | null;
};

export async function requestWithdrawal(client: PoolClient, userId: string, amount: number): Promise<Withdrawal> {
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest("Invalid amount", "invalid_amount");
  const totals = await getCommissionTotals(client, userId);
  const { rows: pendingWithdrawals } = await client.query<{ total: string }>(
    `select coalesce(sum(amount), 0)::text as total from withdrawals
      where user_id = $1 and status in ('requested', 'approved')`,
    [userId],
  );
  const alreadyRequested = Number(pendingWithdrawals[0]?.total ?? 0);
  if (amount > totals.available - alreadyRequested) {
    throw conflict("Requested amount exceeds available commission balance");
  }

  const id = uid("wd");
  const { rows } = await client.query<Withdrawal>(
    `insert into withdrawals (id, user_id, amount, status) values ($1, $2, $3, 'requested') returning *`,
    [id, userId, amount],
  );
  return rows[0]!;
}

export async function decideWithdrawal(
  client: PoolClient,
  withdrawalId: string,
  decision: "approved" | "rejected",
  adminUserId: string,
): Promise<Withdrawal> {
  const { rows } = await client.query<Withdrawal>(`select * from withdrawals where id = $1 for update`, [
    withdrawalId,
  ]);
  const withdrawal = rows[0];
  if (!withdrawal) throw notFound("Withdrawal not found");
  if (withdrawal.status !== "requested") throw conflict(`Withdrawal is ${withdrawal.status}, expected requested`);

  const { rows: updated } = await client.query<Withdrawal>(
    `update withdrawals set status = $2, decided_at = now(), decided_by_admin_id = $3 where id = $1 returning *`,
    [withdrawalId, decision, adminUserId],
  );
  return updated[0]!;
}

/** Mark an approved withdrawal paid, and mark enough 'available' commission
 * rows as 'paid' (oldest first) to cover it — keeps the ledger consistent
 * with money actually sent out, without ever deleting a row. */
export async function markWithdrawalPaid(client: PoolClient, withdrawalId: string): Promise<Withdrawal> {
  const { rows } = await client.query<Withdrawal>(`select * from withdrawals where id = $1 for update`, [
    withdrawalId,
  ]);
  const withdrawal = rows[0];
  if (!withdrawal) throw notFound("Withdrawal not found");
  if (withdrawal.status !== "approved") throw conflict(`Withdrawal is ${withdrawal.status}, expected approved`);

  let remaining = withdrawal.amount;
  const { rows: available } = await client.query<{ id: string; amount: number }>(
    `select id, amount from commission_ledger
      where beneficiary_user_id = $1 and status = 'available'
      order by created_at asc for update`,
    [withdrawal.user_id],
  );
  for (const row of available) {
    if (remaining <= 0) break;
    await client.query(`update commission_ledger set status = 'paid', updated_at = now() where id = $1`, [row.id]);
    remaining -= row.amount;
  }

  const { rows: updated } = await client.query<Withdrawal>(
    `update withdrawals set status = 'paid', paid_at = now() where id = $1 returning *`,
    [withdrawalId],
  );
  return updated[0]!;
}
