// Withdrawals: a member requests a payout against their AVAILABLE commission
// balance. The requested amount is reserved immediately (open requested/
// approved rows reduce spendable available) so it cannot be withdrawn again.
// Mark as Paid finalizes the reserved row and writes payout allocations —
// it does not deduct a second time. Reject/cancel releases the reservation
// once. Nothing is deleted.
import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { getCommissionTotals } from "./commissions.js";
import { requireActiveGrowthProgram } from "./members.js";

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  status: "requested" | "approved" | "rejected" | "paid";
  requested_at: string;
  decided_at: string | null;
  decided_by_admin_id: string | null;
  paid_at: string | null;
  paid_by_admin_id: string | null;
  notes: string | null;
  fee_amount: number;
  net_amount: number;
  payout_method_id: string;
  payout_method_snapshot: Record<string, unknown>;
  admin_payment_reference: string | null;
};

const MIN_WITHDRAWAL = 1000;
const FEE_RATE = 0.025;

async function lockWithdrawalFunds(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `select id from commission_ledger where beneficiary_user_id = $1 and status = 'available' for update`,
    [userId],
  );
  await client.query(
    `select id from withdrawals where user_id = $1 and status in ('requested', 'approved') for update`,
    [userId],
  );
}

export async function requestWithdrawal(client: PoolClient, userId: string, amount: number, payoutMethodId: string): Promise<Withdrawal> {
  if (!Number.isInteger(amount) || amount < MIN_WITHDRAWAL) {
    throw badRequest(`Minimum withdrawal is BDT ${MIN_WITHDRAWAL}`, "minimum_withdrawal");
  }
  await requireActiveGrowthProgram(client, userId, "Growth Program activation is required to withdraw earnings");
  const booking = await client.query(
    `select 1 from bookings where user_id = $1 and status in ('confirmed','activated') limit 1`, [userId],
  );
  if (!booking.rows[0]) throw conflict("At least one own confirmed booking is required to withdraw");
  const { rows: methods } = await client.query<{ id: string; method_type: string; details: Record<string, unknown> }>(
    `select id, method_type, details from payout_methods where id = $1 and user_id = $2`, [payoutMethodId, userId],
  );
  const method = methods[0];
  if (!method) throw badRequest("Select a saved payout method", "payout_method_required");
  await lockWithdrawalFunds(client, userId);
  const totals = await getCommissionTotals(client, userId);
  if (amount > totals.available) {
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
  if (decision === "approved") {
    if (withdrawal.status !== "requested") throw conflict(`Withdrawal is ${withdrawal.status}, expected requested`);
  } else if (withdrawal.status !== "requested" && withdrawal.status !== "approved") {
    throw conflict(`Withdrawal is ${withdrawal.status}, cannot reject`);
  }

  const { rows: updated } = await client.query<Withdrawal>(
    `update withdrawals set status = $2, decided_at = now(), decided_by_admin_id = $3 where id = $1 returning *`,
    [withdrawalId, decision, adminUserId],
  );
  return updated[0]!;
}

/** Mark an approved withdrawal paid. Spendable available was already reduced
 * when the request was created; this step records the payout (reference,
 * paidAt, paidBy, amount/fee/net already on the row) and writes immutable
 * allocation rows so the same amount is not deducted twice. */
export async function markWithdrawalPaid(client: PoolClient, withdrawalId: string, adminId: string, paymentReference: string): Promise<Withdrawal> {
  const reference = paymentReference.trim();
  if (!reference) throw badRequest("Payment reference is required");
  const { rows } = await client.query<Withdrawal>(`select * from withdrawals where id = $1 for update`, [
    withdrawalId,
  ]);
  const withdrawal = rows[0];
  if (!withdrawal) throw notFound("Withdrawal not found");
  if (withdrawal.status === "paid") throw conflict("Withdrawal is already paid");
  if (withdrawal.status !== "approved") throw conflict(`Withdrawal is ${withdrawal.status}, expected approved`);

  const { rows: existingAlloc } = await client.query<{ n: string }>(
    `select count(*)::text as n from commission_payout_allocations where withdrawal_id = $1`,
    [withdrawalId],
  );
  if (Number(existingAlloc[0]?.n ?? 0) > 0) throw conflict("Withdrawal is already paid");

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
       admin_payment_reference = $3
     where id = $1 and status = 'approved' returning *`,
    [withdrawalId, adminId, reference.slice(0, 120)],
  );
  if (!updated[0]) throw conflict("Withdrawal is already paid");
  return updated[0];
}
