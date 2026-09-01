/**
 * Typed client for the Darmelk backend Lambda (the real business engine —
 * offers, bookings, network, qualification, commission, activation,
 * withdrawals, admin). Replaces the old `usePlatform` in-memory mock store:
 * every call here goes over HTTPS to the API Gateway in front of the Lambda,
 * which is the only thing with network access to the private RDS database.
 *
 * `VITE_API_URL` must be set (Vercel project env var) to the backend's public
 * URL. Every call sends cookies (`credentials: "include"`) since Better Auth
 * sessions live there.
 */
const API_URL = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit & { idempotencyKey?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init?.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? "unknown_error", err?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

const post = <T>(path: string, body?: unknown, idempotencyKey?: string) =>
  request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined, idempotencyKey });

// ---- types mirroring the backend's response shapes -----------------------
export type Offer = {
  slug: string;
  title: string;
  category: string;
  category_slug: string;
  location: string | null;
  image: string | null;
  hero_image: string | null;
  retail_value: number;
  booking_amount: number;
  qualification_benefit: number;
  status: "available" | "coming-soon";
  flagship: boolean;
  summary: string;
};

export type Member = {
  user_id: string;
  referral_code: string;
  phone: string;
  role: "member" | "admin";
  sponsor_user_id: string | null;
  network_parent_user_id: string | null;
  network_slot: number | null;
  onboarding_complete: boolean;
  activation_status: "inactive" | "pending" | "active" | "expired";
  activation_expires_at: string | null;
  created_at: string;
};

export type Booking = {
  id: string;
  user_id: string;
  offer_slug: string;
  offer_title?: string;
  image?: string;
  category?: string;
  retail_value: number;
  booking_amount: number;
  qualification_benefit: number;
  status: "pending" | "confirmed" | "activated" | "cancelled" | "reversed";
  created_at: string;
  confirmed_at: string | null;
  activated_at: string | null;
  cancelled_at: string | null;
};

export type Commission = {
  id: string;
  beneficiary_user_id: string;
  source_booking_id: string;
  source_user_id: string;
  level: number;
  rate: number;
  source_booking_amount: number;
  amount: number;
  status: "pending" | "available" | "paid" | "reversed" | "rejected";
  created_at: string;
  source_offer_title?: string;
  beneficiary_name?: string;
  beneficiary_email?: string;
};

export type CommissionTotals = { available: number; pending: number; paid: number; reversed: number; rejected: number };

export type QualificationStatus = {
  sponsorCount: number;
  sponsorTarget: number;
  levelCounts: Record<1 | 2 | 3 | 4 | 5, number>;
  level5Complete: boolean;
  qualified: boolean;
};

export type AnnualActivation = {
  id: string;
  user_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status: "pending" | "active" | "expired" | "rejected";
  requested_at: string;
  decided_at: string | null;
};

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  status: "requested" | "approved" | "rejected" | "paid";
  requested_at: string;
  decided_at: string | null;
  paid_at: string | null;
  fee_amount: number;
  net_amount: number;
  payout_method_id: string;
  payout_method_snapshot: { methodType: string; details: Record<string, string> };
  admin_payment_reference: string | null;
  user_name?: string;
  user_email?: string;
};

export type PaymentDestination = { method: "bkash" | "nagad" | "bank"; label: string; account: string; accountType?: string; bankName?: string; accountName?: string; branch?: string; routingNumber?: string | null };
export type PaymentSubmission = { id: string; target_type: "activation" | "booking"; target_id: string; user_id: string; amount: number; payment_method: "bkash" | "nagad" | "bank"; destination_snapshot: PaymentDestination; reference_id: string; proof_filename: string; proof_mime: string; notes: string | null; status: "submitted" | "under_review" | "approved" | "rejected"; submitted_at: string; reviewed_at: string | null; rejection_reason: string | null; user_name?: string; user_email?: string };
export type PayoutMethod = { id: string; method_type: "bkash" | "nagad" | "bank"; details: Record<string, string>; created_at: string; updated_at: string };

export type Transaction = {
  id: string;
  type: "booking" | "commission" | "activation" | "withdrawal";
  amount: number;
  status: string;
  created_at: string;
  reference: string;
};

export const api = {
  paymentDestinations: () => request<{ destinations: PaymentDestination[] }>("/api/payment-destinations"),
  me: () => request<{ member: Member }>("/api/me"),
  onboarding: (data: { name?: string; phone?: string; sponsorCode?: string }) =>
    post<{ member: Member }>("/api/me/onboarding", data),

  offers: () => request<{ offers: Offer[] }>("/api/offers"),
  offer: (slug: string) => request<{ offer: Offer }>(`/api/offers/${slug}`),

  myNetwork: () =>
    request<{
      qualification: QualificationStatus;
      levelCounts: Record<1 | 2 | 3 | 4 | 5, number>;
      directs: Array<{ user_id: string; referral_code: string; name: string; email: string; activation_status: string; created_at: string }>;
      totalPositions: number;
      sponsorTarget: number;
    }>("/api/me/network"),
  myQualification: () => request<QualificationStatus & { ownBooking: Booking | null }>("/api/me/qualification"),
  myCommissions: () => request<{ totals: CommissionTotals; commissions: Commission[] }>("/api/me/commissions"),
  myTransactions: () => request<{ transactions: Transaction[] }>("/api/me/transactions"),
  myBookings: () => request<{ bookings: Booking[] }>("/api/me/bookings"),
  myActivations: () => request<{ activations: AnnualActivation[] }>("/api/me/activation"),
  myWithdrawals: () => request<{ withdrawals: Withdrawal[] }>("/api/me/withdrawals"),
  myPayments: () => request<{ payments: PaymentSubmission[] }>("/api/me/payments"),
  payoutMethods: () => request<{ methods: PayoutMethod[] }>("/api/me/payout-methods"),
  savePayoutMethod: (methodType: PayoutMethod["method_type"], details: Record<string, string>) =>
    post<{ method: PayoutMethod }>("/api/me/payout-methods", { methodType, details }),

  booking: (id: string) => request<{ booking: Booking }>(`/api/bookings/${id}`),
  createBooking: (offerSlug: string, idempotencyKey: string) =>
    post<{ booking: Booking }>("/api/bookings", { offerSlug }, idempotencyKey),

  requestActivation: (idempotencyKey: string) => post<{ activation: AnnualActivation }>("/api/activation/request", {}, idempotencyKey),
  submitPayment: (data: { targetType: "activation" | "booking"; targetId: string; paymentMethod: "bkash" | "nagad" | "bank"; referenceId: string; proofFilename: string; proofMime: string; proofBase64: string; notes?: string }, idempotencyKey: string) =>
    post<{ payment: PaymentSubmission }>("/api/payments", data, idempotencyKey),
  requestWithdrawal: (amount: number, payoutMethodId: string, idempotencyKey: string) =>
    post<{ withdrawal: Withdrawal }>("/api/withdrawals", { amount, payoutMethodId }, idempotencyKey),

  admin: {
    bookings: (status?: string) =>
      request<{ bookings: Booking[] }>(`/api/admin/bookings${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    confirmBooking: (id: string) => post<{ booking: Booking }>(`/api/admin/bookings/${id}/confirm`),
    activateBooking: (id: string) => post<{ booking: Booking }>(`/api/admin/bookings/${id}/activate`),
    cancelBooking: (id: string) => post<{ booking: Booking }>(`/api/admin/bookings/${id}/cancel`),
    reverseBooking: (id: string, reason: string) =>
      post<{ booking: Booking; commissionsReversed: number }>(`/api/admin/bookings/${id}/reverse`, { reason }),

    commissions: () => request<{ commissions: Commission[] }>("/api/admin/commissions"),

    withdrawals: () => request<{ withdrawals: Withdrawal[] }>("/api/admin/withdrawals"),
    decideWithdrawal: (id: string, decision: "approve" | "reject" | "mark-paid", paymentReference?: string) =>
      post<{ withdrawal: Withdrawal }>(`/api/admin/withdrawals/${id}/${decision}`, { paymentReference }),
    payments: () => request<{ payments: PaymentSubmission[] }>("/api/admin/payments"),
    reviewPayment: (id: string) => post<{ payment: PaymentSubmission }>(`/api/admin/payments/${id}/review`),
    decidePayment: (id: string, decision: "approve" | "reject", reason?: string) =>
      post<{ payment: PaymentSubmission }>(`/api/admin/payments/${id}/${decision}`, { reason }),

    activations: () => request<{ activations: AnnualActivation[] }>("/api/admin/activations"),
    decideActivation: (id: string, decision: "approve" | "reject") =>
      post<{ activation: AnnualActivation }>(`/api/admin/activations/${id}/${decision}`),

    users: () => request<{ members: Array<Member & { name: string; email: string }> }>("/api/admin/users"),
    setRole: (id: string, role: "admin" | "member") => post<{ member: Member }>(`/api/admin/users/${id}/role`, { role }),

    upsertOffer: (offer: Partial<Offer> & { slug: string }) => post<{ offer: Offer }>("/api/admin/offers", offer),
  },
};
