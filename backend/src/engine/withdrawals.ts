// Withdrawals: a member requests a payout against their AVAILABLE commission
// balance. Nothing is deducted from the ledger on request — only on admin
// approval, and even then by marking commission rows 'paid' rather than
// deleting anything, so the full history stays intact.
import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { getCommissionTotals } from "./commissions.js";
import { requireActiveMember } from "./members.js";

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
  fee_amount: number;
  net_amount: number;
  payout_method_id: string;
  payout_method_snapshot: Record<string, unknown>;
  admin_payment_reference: string | null;
};

const MIN_WITHDRAWAL = 1000;
const FEE_RATE = 0.025;

export async function requestWithdrawal(client: PoolClient, userId: string, amount: number, payoutMethodId: string): Promise<Withdrawal> {
  if (!Number.isInteger(amount) || amount < MIN_WITHDRAWAL) {
    throw badRequest(`Minimum withdrawal is BDT ${MIN_WITHDRAWAL}`, "minimum_withdrawal");
  }
  await requireActiveMember(client, userId, "Annual activation is required to withdraw earnings");
  const booking = await client.query(
    `select 1 from bookings where user_id = $1 and status in ('confirmed','activated') limit 1`, [userId],
  );
  if (!booking.rows[0]) throw conflict("At least one own confirmed booking is required to withdraw");
  const { rows: methods } = await client.query<{ id: string; method_type: string; details: Record<string, unknown> }>(
    `select id, method_type, details from payout_methods where id = $1 and user_id = $2`, [payoutMethodId, userId],
  );
  const method = methods[0];
  if (!method) throw badRequest("Select a saved payout method", "payout_method_required");
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

  const feeAmount = Math.round(amount * FEE_RATE);
  const netAmount = amount - feeAmount;
  const id = uid("wd");
  const { rows } = await client.query<Withdrawal>(
    `insert into withdrawals
      (id, user_id, amount, fee_amount, net_amount, payout_method_id, payout_method_snapshot, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'requested') returning *`,
    [id, userId, amount, feeAmount, netAmount, method.id, JSON.stringify({ methodType: method.method_type, details: method.details })],
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
export async function markWithdrawalPaid(client: PoolClient, withdrawalId: string, adminId: string, paymentReference: string): Promise<Withdrawal> {
  if (!paymentReference.trim()) throw badRequest("Payment reference is required");
  const { rows } = await client.query<Withdrawal>(`select * from withdrawals where id = $1 for update`, [
    withdrawalId,
  ]);
  const withdrawal = rows[0];
  if (!withdrawal) throw notFound("Withdrawal not found");
  if (withdrawal.status !== "approved") throw conflict(`Withdrawal is ${withdrawal.status}, expected approved`);

  let remaining = withdrawal.amount;
  const { rows: available } = await client.query<{ id: string; amount: number; allocated: string }>(
    `select cl.id, cl.amount, coalesce((select sum(cpa.amount) from commission_payout_allocations cpa where cpa.commission_ledger_id=cl.id),0)::text as allocated
       from commission_ledger cl
      where cl.beneficiary_user_id = $1 and cl.status = 'available'
      order by cl.created_at asc for update of cl`,
    [withdrawal.user_id],
  );
  for (const row of available) {
    if (remaining <= 0) break;
    const room = row.amount - Number(row.allocated);
    const allocated = Math.min(room, remaining);
    if (allocated <= 0) continue;
    await client.query(`insert into commission_payout_allocations (id,withdrawal_id,commission_ledger_id,amount) values ($1,$2,$3,$4)`, [uid("pa"), withdrawalId, row.id, allocated]);
    if (allocated === room) await client.query(`update commission_ledger set status='paid',updated_at=now() where id=$1`, [row.id]);
    remaining -= allocated;
  }
  if (remaining > 0) throw conflict("Available commission changed before payout completion");

  const { rows: updated } = await client.query<Withdrawal>(
    `update withdrawals set status = 'paid', paid_at = now(), paid_by_admin_id = $2,
       admin_payment_reference = $3 where id = $1 returning *`,
    [withdrawalId, adminId, paymentReference.trim().slice(0, 120)],
  );
  return updated[0]!;
}
