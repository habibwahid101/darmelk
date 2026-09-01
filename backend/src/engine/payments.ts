import type { PoolClient } from "pg";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { uid } from "../ids.js";

export const PAYMENT_DESTINATIONS = {
  bkash: { method: "bkash", label: "bKash Merchant", account: "01813212777", accountType: "Merchant" },
  nagad: { method: "nagad", label: "Nagad Merchant", account: "01813212777", accountType: "Merchant" },
  bank: {
    method: "bank",
    label: "Bank transfer",
    bankName: "The City Bank PLC",
    accountName: "AIC",
    account: "1503885023001",
    branch: "Kalurghat, Chattogram",
    routingNumber: null,
  },
} as const;

export type PaymentMethod = keyof typeof PAYMENT_DESTINATIONS;
export type PaymentTarget = "activation" | "booking";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_PROOF_BYTES = 4 * 1024 * 1024;

export type PaymentSubmission = {
  id: string;
  target_type: PaymentTarget;
  target_id: string;
  user_id: string;
  amount: number;
  payment_method: PaymentMethod;
  destination_snapshot: Record<string, unknown>;
  reference_id: string;
  proof_filename: string;
  proof_mime: string;
  notes: string | null;
  status: "submitted" | "under_review" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by_admin_id: string | null;
  rejection_reason: string | null;
};

function cleanText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw badRequest(`${field} is required`);
  const result = value.trim();
  if (result.length > max) throw badRequest(`${field} is too long`);
  return result;
}

export async function createPaymentSubmission(
  client: PoolClient,
  userId: string,
  input: {
    targetType: PaymentTarget;
    targetId: string;
    paymentMethod: PaymentMethod;
    referenceId: unknown;
    proofFilename: unknown;
    proofMime: unknown;
    proofBase64: unknown;
    notes?: unknown;
  },
): Promise<PaymentSubmission> {
  const destination = PAYMENT_DESTINATIONS[input.paymentMethod];
  if (!destination) throw badRequest("Unsupported payment method");
  const targetId = cleanText(input.targetId, "targetId", 120);
  const referenceId = cleanText(input.referenceId, "referenceId", 120);
  const proofFilename = cleanText(input.proofFilename, "proofFilename", 180);
  const proofMime = cleanText(input.proofMime, "proofMime", 80).toLowerCase();
  if (!ALLOWED_MIME.has(proofMime)) throw badRequest("Proof must be a JPG, PNG, WebP, or PDF");
  if (typeof input.proofBase64 !== "string" || !input.proofBase64) throw badRequest("Payment proof is required");
  const proof = Buffer.from(input.proofBase64, "base64");
  if (!proof.length || proof.length > MAX_PROOF_BYTES) throw badRequest("Payment proof must be 4 MB or smaller");
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 1000) : null;

  let amount: number;
  if (input.targetType === "activation") {
    const { rows } = await client.query<{ user_id: string; amount: number; status: string }>(
      `select user_id, amount, status from annual_activations where id = $1 for update`, [targetId],
    );
    const target = rows[0];
    if (!target || target.user_id !== userId) throw notFound("Activation request not found");
    if (target.status !== "pending") throw conflict(`Activation is ${target.status}`);
    amount = target.amount;
  } else if (input.targetType === "booking") {
    const { rows } = await client.query<{ user_id: string; booking_amount: number; status: string }>(
      `select user_id, booking_amount, status from bookings where id = $1 for update`, [targetId],
    );
    const target = rows[0];
    if (!target || target.user_id !== userId) throw notFound("Booking not found");
    if (target.status !== "pending") throw conflict(`Booking is ${target.status}`);
    amount = target.booking_amount;
  } else {
    throw badRequest("Unsupported payment target");
  }

  const { rows } = await client.query<PaymentSubmission>(
    `insert into payment_submissions
      (id, target_type, target_id, user_id, amount, payment_method, destination_snapshot,
       reference_id, proof_filename, proof_mime, proof_data, notes, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'submitted') returning
       id,target_type,target_id,user_id,amount,payment_method,destination_snapshot,reference_id,
       proof_filename,proof_mime,notes,status,submitted_at,reviewed_at,reviewed_by_admin_id,rejection_reason`,
    [uid("pay"), input.targetType, targetId, userId, amount, input.paymentMethod,
      JSON.stringify(destination), referenceId, proofFilename, proofMime, proof, notes],
  );
  return rows[0]!;
}

export async function getPaymentProof(client: PoolClient, paymentId: string, requesterId: string) {
  const { rows } = await client.query<{ user_id: string; proof_data: Buffer; proof_mime: string; proof_filename: string }>(
    `select user_id, proof_data, proof_mime, proof_filename from payment_submissions where id = $1`, [paymentId],
  );
  const row = rows[0];
  if (!row) throw notFound("Payment proof not found");
  if (row.user_id !== requesterId) {
    const admin = await client.query(`select 1 from members where user_id = $1 and role = 'admin'`, [requesterId]);
    if (!admin.rows[0]) throw forbidden("Payment proof access denied");
  }
  return row;
}

export async function markPaymentUnderReview(client: PoolClient, paymentId: string, adminId: string) {
  const { rows } = await client.query<PaymentSubmission>(
    `update payment_submissions set status = 'under_review', reviewed_by_admin_id = $2
      where id = $1 and status = 'submitted' returning
       id,target_type,target_id,user_id,amount,payment_method,destination_snapshot,reference_id,
       proof_filename,proof_mime,notes,status,submitted_at,reviewed_at,reviewed_by_admin_id,rejection_reason`,
    [paymentId, adminId],
  );
  if (!rows[0]) throw conflict("Payment is not awaiting review");
  return rows[0];
}

export async function finalizePayment(
  client: PoolClient,
  paymentId: string,
  status: "approved" | "rejected",
  adminId: string,
  reason?: string,
) {
  const { rows } = await client.query<PaymentSubmission>(`select * from payment_submissions where id = $1 for update`, [paymentId]);
  const payment = rows[0];
  if (!payment) throw notFound("Payment not found");
  if (payment.status !== "under_review" && payment.status !== "submitted") throw conflict(`Payment is ${payment.status}`);
  if (status === "rejected" && !reason?.trim()) throw badRequest("Rejection reason is required");
  const { rows: updated } = await client.query<PaymentSubmission>(
    `update payment_submissions set status = $2, reviewed_at = now(), reviewed_by_admin_id = $3,
       rejection_reason = $4 where id = $1 returning
       id,target_type,target_id,user_id,amount,payment_method,destination_snapshot,reference_id,
       proof_filename,proof_mime,notes,status,submitted_at,reviewed_at,reviewed_by_admin_id,rejection_reason`,
    [paymentId, status, adminId, status === "rejected" ? reason!.trim().slice(0, 500) : null],
  );
  return updated[0]!;
}
