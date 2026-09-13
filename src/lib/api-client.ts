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
import type { ApiJob } from "@/lib/jobs";
import type { ApiOffer, OfferStatus } from "@/lib/offers";

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
export type Offer = ApiOffer;

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
  merchant_request_status?: string | null;
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
  source_member_name?: string;
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

export type LeadershipEvidence = { user_id: string; eligible_at: string; name?: string; email?: string };

export type LeadershipSnapshot = {
  eligible: boolean;
  level5Complete: boolean;
  level5CompletedAt: string | null;
  qualification: QualificationStatus;
  cycle: null | {
    id: string;
    startMonth: string;
    endMonth: string;
    phase: "upcoming" | "active" | "completed";
    currentMonthNumber: number | null;
    currentTier: number | null;
    nextTier: number | null;
    nextTierProgress: { count: number; target: number };
    nextRequirement: string | null;
    monthsCompleted: number;
    monthsRemaining: number;
    totalEarned: number;
    finalTier: number;
  };
  entitlements: Array<{
    id: string;
    rewardMonth: string;
    cycleMonth: number;
    tier: number;
    amount: number;
    status: string;
    createdAt: string;
    paidAt: string | null;
  }>;
  projected: Array<{ rewardMonth: string; cycleMonth: number; tier: number; amount: number; status: "upcoming" }>;
  evidence: { tier50: LeadershipEvidence[]; tier100: LeadershipEvidence[] };
  tierEvents: Array<{
    tier: number;
    eligibleAt: string;
    effectiveMonth: string;
    appliesInCycle: boolean;
    evidence: LeadershipEvidence[];
  }>;
};

export type LeadershipRewardSummary = {
  userId: string;
  name: string;
  email: string;
  cycleId: string;
  startMonth: string;
  endMonth: string;
  phase: "upcoming" | "active" | "completed";
  currentMonthNumber: number | null;
  currentTier: number;
  totalEarned: number;
  monthsEarned: number;
  level5CompletedAt: string;
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
  paid_by_admin_id: string | null;
  fee_amount: number;
  net_amount: number;
  payout_method_id: string;
  payout_method_snapshot: { methodType: string; details: Record<string, string> };
  admin_payment_reference: string | null;
  user_name?: string;
  user_email?: string;
  member_active?: boolean;
  own_booking_eligible?: boolean;
};

export type PaymentDestination = { method: "bkash" | "nagad" | "bank"; label: string; account: string; accountType?: string; bankName?: string; accountName?: string; branch?: string; routingNumber?: string | null };
export type PaymentSubmission = { id: string; target_type: "activation" | "booking" | "merchant_bundle"; target_id: string; user_id: string; amount: number; payment_method: "bkash" | "nagad" | "bank"; destination_snapshot: PaymentDestination; reference_id: string; proof_filename: string; proof_mime: string; notes: string | null; status: "submitted" | "under_review" | "approved" | "rejected"; submitted_at: string; reviewed_at: string | null; rejection_reason: string | null; user_name?: string; user_email?: string };
export type PayoutMethod = { id: string; method_type: "bkash" | "nagad" | "bank"; details: Record<string, string>; created_at: string; updated_at: string };

export type MerchantGift = { label: string; quantity: number };
export type MerchantBundle = {
  id: string;
  name: string;
  description: string;
  purchase_amount: number;
  purchased_credit: number;
  bonus_credit: number;
  gifts: MerchantGift[];
  terms: string;
  terms_version: number;
  status: "draft" | "active" | "inactive";
  version: number;
  display_order: number;
  created_at: string;
  updated_at: string;
};
export type MerchantAccount = {
  user_id: string;
  status: "pending" | "active" | "suspended" | "inactive";
  activated_at: string | null;
  purchased_issued: number;
  bonus_issued: number;
  available: number;
  reserved: number;
  settled: number;
  created_at: string;
  updated_at: string;
  name?: string;
  email?: string;
};
export type MerchantSummary = {
  status: MerchantAccount["status"];
  available: number;
  reserved: number;
  settled: number;
  purchasedIssued: number;
  bonusIssued: number;
  pendingIncomingCount: number;
};
export type MerchantPurchase = {
  id: string;
  user_id: string;
  bundle_id: string;
  bundle_version: number;
  bundle_name: string;
  purchase_amount: number;
  purchased_credit: number;
  bonus_credit: number;
  gifts_snapshot: MerchantGift[];
  terms_snapshot: string;
  terms_version: number;
  terms_accepted: boolean;
  terms_accepted_at: string;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  confirmed_at: string | null;
  rejected_at: string | null;
};
export type MerchantPaymentRequest = {
  id: string;
  booking_id: string;
  customer_user_id: string;
  merchant_user_id: string;
  amount: number;
  offer_slug: string;
  offer_title: string;
  status: "pending" | "approved" | "declined" | "cancelled" | "settled" | "reversed";
  created_at: string;
  decided_at: string | null;
  settled_at: string | null;
  reversed_at: string | null;
  customer_name?: string;
  customer_email?: string;
  merchant_name?: string;
  merchant_email?: string;
};
export type MerchantLedgerEntry = {
  id: string;
  merchant_user_id: string;
  entry_type: string;
  amount: number;
  available_delta: number;
  reserved_delta: number;
  settled_delta: number;
  purchased_issued_delta: number;
  bonus_issued_delta: number;
  bundle_purchase_id: string | null;
  payment_request_id: string | null;
  booking_id: string | null;
  actor_user_id: string | null;
  reason: string | null;
  idempotency_key: string;
  created_at: string;
  merchant_name?: string;
  merchant_email?: string;
};
export type MerchantGiftFulfillment = {
  id: string;
  purchase_id: string;
  merchant_user_id: string;
  gift_label: string;
  quantity: number;
  status: "pending" | "fulfilled" | "cancelled";
  created_at: string;
  updated_at: string;
  fulfilled_at: string | null;
  notes: string | null;
  bundle_name?: string;
  merchant_name?: string;
};
export type MerchantDashboard = {
  merchant: MerchantAccount | null;
  bundles: MerchantBundle[];
  purchases: MerchantPurchase[];
  incomingRequests: MerchantPaymentRequest[];
  outgoingRequests: MerchantPaymentRequest[];
  ledger: MerchantLedgerEntry[];
  gifts: MerchantGiftFulfillment[];
};
export type MerchantOverview = {
  active_merchants: number;
  pending_purchases: number;
  pending_requests: number;
  purchased_issued: number;
  bonus_issued: number;
  available: number;
  reserved: number;
  settled: number;
  recent: Array<{ id: string; merchant_user_id: string; entry_type: string; amount: number; created_at: string }>;
};

export type PromotionReward = {
  id?: string;
  name: string;
  description: string;
  quantity: number;
  value_amount: number | null;
  instructions: string | null;
  display_order: number;
};
export type PromotionOfferRef = { slug: string; title: string };
export type PromotionLifecycle = "draft" | "upcoming" | "active" | "expired" | "closed";
export type Promotion = {
  id: string;
  title: string;
  short_description: string;
  description: string;
  start_at: string;
  end_at: string;
  offer_scope: "all" | "selected";
  terms: string;
  terms_version: number;
  version: number;
  has_banner: boolean;
  status: "draft" | "published" | "closed";
  lifecycle: PromotionLifecycle;
  display_order: number;
  created_at: string;
  updated_at: string;
  offers: PromotionOfferRef[];
  rewards: PromotionReward[];
};
export type PromotionFulfillment = {
  id: string;
  qualification_id: string;
  promotion_id: string;
  user_id: string;
  reward_name: string;
  reward_description: string;
  quantity: number;
  value_amount: number | null;
  instructions: string | null;
  display_order: number;
  status: "eligible" | "approved" | "fulfilled" | "cancelled" | "reversed";
  created_at: string;
  updated_at: string;
  notes: string | null;
  events?: Array<{
    id: string;
    previous_status: string | null;
    new_status: string;
    reason: string | null;
    actor_user_id: string | null;
    created_at: string;
  }>;
  user_name?: string;
  user_email?: string;
  promotion_title?: string;
  booking_id?: string;
};
export type PromotionQualification = {
  id: string;
  promotion_id: string;
  user_id: string;
  booking_id: string;
  offer_slug: string;
  offer_title: string;
  booking_confirmed_at: string;
  qualified_at: string;
  promotion_title: string;
  promotion_version: number;
  terms_snapshot: string;
  terms_version: number;
  rewards_snapshot: PromotionReward[];
  start_at: string;
  end_at: string;
  user_name?: string;
  user_email?: string;
  fulfillments?: PromotionFulfillment[];
};
export type PromotionOverview = {
  serverNow: string;
  active: number;
  draft: number;
  upcoming: number;
  expired: number;
  closed: number;
  qualified_members: number;
  pending_fulfillment: number;
};
export type PromotionDashboard = {
  serverNow: string;
  primary: Promotion | null;
  more: Promotion[];
  qualifications: PromotionQualification[];
};

export type Transaction = {
  id: string;
  type: "booking" | "commission" | "activation" | "withdrawal";
  amount: number;
  status: string;
  created_at: string;
  reference: string;
};

export type ContactRequest = {
  id: string;
  name: string;
  profession: string;
  mobile: string;
  location: string;
  offer_slug?: string | null;
  offer_title?: string | null;
  source?: "contact" | "request_to_book";
  status: "new" | "reviewed" | "closed";
  created_at: string;
  updated_at: string;
};

export const api = {
  paymentDestinations: () => request<{ destinations: PaymentDestination[] }>("/api/payment-destinations"),
  me: () => request<{ member: Member; merchant: MerchantSummary | null }>("/api/me"),
  onboarding: (data: { name?: string; phone?: string; sponsorCode?: string; termsAccepted?: boolean }) =>
    post<{ member: Member }>("/api/me/onboarding", data),
  lookupSponsor: (code: string) =>
    request<{ ok: true; referralCode: string }>(`/api/referral/${encodeURIComponent(code.trim().toUpperCase())}`),
  submitContact: (data: {
    name: string;
    profession: string;
    mobile: string;
    location: string;
    offerSlug?: string;
    source?: "contact" | "request_to_book";
  }) => post<{ request: ContactRequest }>("/api/contact", data),

  offers: () => request<{ offers: Offer[] }>("/api/offers"),
  offer: (slug: string) => request<{ offer: Offer }>(`/api/offers/${slug}`),
  jobs: () => request<{ jobs: ApiJob[] }>("/api/jobs"),
  job: (slug: string) => request<{ job: ApiJob }>(`/api/jobs/${encodeURIComponent(slug)}`),

  myNetwork: () =>
    request<{
      qualification: QualificationStatus;
      levelCounts: Record<1 | 2 | 3 | 4 | 5, number>;
      directs: Array<{ user_id: string; referral_code: string; name: string; email: string; activation_status: string; created_at: string }>;
      totalPositions: number;
      sponsorTarget: number;
    }>("/api/me/network"),
  myQualification: () => request<QualificationStatus & { ownBooking: Booking | null }>("/api/me/qualification"),
  myLeadershipReward: () => request<{ leadership: LeadershipSnapshot }>("/api/me/leadership-reward"),
  myPromotions: () => request<PromotionDashboard>("/api/me/promotions"),
  myCommissions: () => request<{ totals: CommissionTotals; commissions: Commission[] }>("/api/me/commissions"),
  myTransactions: () => request<{ transactions: Transaction[] }>("/api/me/transactions"),
  myBookings: () => request<{ bookings: Booking[] }>("/api/me/bookings"),
  myActivations: () => request<{ activations: AnnualActivation[] }>("/api/me/activation"),
  myWithdrawals: () => request<{ withdrawals: Withdrawal[] }>("/api/me/withdrawals"),
  myPayments: () => request<{ payments: PaymentSubmission[] }>("/api/me/payments"),
  payoutMethods: () => request<{ methods: PayoutMethod[] }>("/api/me/payout-methods"),
  savePayoutMethod: (methodType: PayoutMethod["method_type"], details: Record<string, string>) =>
    post<{ method: PayoutMethod }>("/api/me/payout-methods", { methodType, details }),

  booking: (id: string) => request<{ booking: Booking; merchantRequest: MerchantPaymentRequest | null }>(`/api/bookings/${id}`),
  createBooking: (offerSlug: string, idempotencyKey: string) =>
    post<{ booking: Booking }>("/api/bookings", { offerSlug }, idempotencyKey),
  requestMerchantPay: (bookingId: string, merchantUserId: string, idempotencyKey: string) =>
    post<{ request: MerchantPaymentRequest }>(`/api/bookings/${bookingId}/merchant-pay`, { merchantUserId }, idempotencyKey),

  promotions: () => request<{ promotions: Promotion[]; serverNow: string }>("/api/promotions"),
  promotion: (id: string) =>
    request<{ promotion: Promotion; myQualification: PromotionQualification | null; serverNow: string }>(
      `/api/promotions/${encodeURIComponent(id)}`,
    ),
  promotionBannerUrl: (id: string) => `${API_URL}/api/promotions/${encodeURIComponent(id)}/banner`,

  merchantBundles: () => request<{ bundles: MerchantBundle[] }>("/api/merchant-bundles"),
  myMerchant: () => request<MerchantDashboard>("/api/me/merchant"),
  startMerchantPurchase: (bundleId: string, termsAccepted: boolean, idempotencyKey: string) =>
    post<{ purchase: MerchantPurchase }>("/api/me/merchant/purchases", { bundleId, termsAccepted }, idempotencyKey),
  approveMerchantRequest: (id: string, idempotencyKey: string) =>
    post<{ request: MerchantPaymentRequest }>(`/api/me/merchant/requests/${id}/approve`, {}, idempotencyKey),
  declineMerchantRequest: (id: string, idempotencyKey: string) =>
    post<{ request: MerchantPaymentRequest }>(`/api/me/merchant/requests/${id}/decline`, {}, idempotencyKey),

  requestActivation: (idempotencyKey: string) => post<{ activation: AnnualActivation }>("/api/activation/request", {}, idempotencyKey),
  submitPayment: (data: { targetType: "activation" | "booking" | "merchant_bundle"; targetId: string; paymentMethod: "bkash" | "nagad" | "bank"; referenceId: string; proofFilename: string; proofMime: string; proofBase64: string; notes?: string }, idempotencyKey: string) =>
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
    contactRequests: () => request<{ requests: ContactRequest[] }>("/api/admin/contact-requests"),
    updateContactRequest: (id: string, status: ContactRequest["status"]) =>
      post<{ request: ContactRequest }>(`/api/admin/contact-requests/${id}/status`, { status }),

    offers: () => request<{ offers: Offer[] }>("/api/admin/offers"),
    offer: (slug: string) => request<{ offer: Offer }>(`/api/admin/offers/${encodeURIComponent(slug)}`),
    createOffer: (offer: Record<string, unknown>) => post<{ offer: Offer }>("/api/admin/offers", offer),
    updateOffer: (slug: string, offer: Record<string, unknown>) =>
      post<{ offer: Offer }>(`/api/admin/offers/${encodeURIComponent(slug)}`, offer),
    setOfferStatus: (slug: string, status: OfferStatus | "unpublish") =>
      post<{ offer: Offer }>(`/api/admin/offers/${encodeURIComponent(slug)}/status`, { status }),
    addOfferMedia: (
      slug: string,
      data: { kind: "cover" | "hero" | "gallery"; filename: string; mime: string; bytesBase64: string; alt?: string },
    ) => post<{ offer: Offer; src: string; id: string }>(`/api/admin/offers/${encodeURIComponent(slug)}/media`, data),
    removeOfferMedia: (slug: string, id: string) =>
      post<{ offer: Offer }>(`/api/admin/offers/${encodeURIComponent(slug)}/media/${encodeURIComponent(id)}/remove`),

    jobs: () => request<{ jobs: ApiJob[] }>("/api/admin/jobs"),
    job: (slug: string) => request<{ job: ApiJob }>(`/api/admin/jobs/${encodeURIComponent(slug)}`),
    createJob: (job: Record<string, unknown>) => post<{ job: ApiJob }>("/api/admin/jobs", job),
    updateJob: (slug: string, job: Record<string, unknown>) =>
      post<{ job: ApiJob }>(`/api/admin/jobs/${encodeURIComponent(slug)}`, job),
    setJobStatus: (slug: string, status: "draft" | "published" | "closed" | "unpublish") =>
      post<{ job: ApiJob }>(`/api/admin/jobs/${encodeURIComponent(slug)}/status`, { status }),

    leadershipRewards: () => request<{ rewards: LeadershipRewardSummary[] }>("/api/admin/leadership-rewards"),
    leadershipReward: (userId: string) =>
      request<{
        member: { userId: string; name: string; email: string; referral_code: string };
        leadership: LeadershipSnapshot;
      }>(`/api/admin/leadership-rewards/${encodeURIComponent(userId)}`),

    merchantOverview: () => request<{ overview: MerchantOverview }>("/api/admin/merchant/overview"),
    merchantBundles: () => request<{ bundles: MerchantBundle[] }>("/api/admin/merchant/bundles"),
    merchantBundle: (id: string) => request<{ bundle: MerchantBundle }>(`/api/admin/merchant/bundles/${encodeURIComponent(id)}`),
    createMerchantBundle: (bundle: Record<string, unknown>) => post<{ bundle: MerchantBundle }>("/api/admin/merchant/bundles", bundle),
    updateMerchantBundle: (id: string, bundle: Record<string, unknown>) =>
      post<{ bundle: MerchantBundle }>(`/api/admin/merchant/bundles/${encodeURIComponent(id)}`, bundle),
    setMerchantBundleStatus: (id: string, status: "draft" | "active" | "inactive") =>
      post<{ bundle: MerchantBundle }>(`/api/admin/merchant/bundles/${encodeURIComponent(id)}/status`, { status }),
    merchants: () => request<{ merchants: MerchantAccount[] }>("/api/admin/merchant/accounts"),
    merchant: (userId: string) =>
      request<MerchantDashboard & { merchant: MerchantAccount }>(`/api/admin/merchant/accounts/${encodeURIComponent(userId)}`),
    setMerchantStatus: (userId: string, status: "active" | "suspended" | "inactive") =>
      post<{ merchant: MerchantAccount }>(`/api/admin/merchant/accounts/${encodeURIComponent(userId)}/status`, { status }),
    adjustMerchantCredit: (userId: string, data: { amount: number; direction: "credit" | "debit"; reason: string }) =>
      post<{ merchant: MerchantAccount }>(`/api/admin/merchant/accounts/${encodeURIComponent(userId)}/adjust`, data),
    merchantRequests: (status?: string) =>
      request<{ requests: MerchantPaymentRequest[] }>(`/api/admin/merchant/requests${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    merchantLedger: (opts?: { userId?: string; entryType?: string }) => {
      const params = new URLSearchParams();
      if (opts?.userId) params.set("userId", opts.userId);
      if (opts?.entryType) params.set("entryType", opts.entryType);
      const q = params.toString();
      return request<{ entries: MerchantLedgerEntry[] }>(`/api/admin/merchant/ledger${q ? `?${q}` : ""}`);
    },
    merchantGifts: (status?: string) =>
      request<{ gifts: MerchantGiftFulfillment[] }>(`/api/admin/merchant/gifts${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    setMerchantGiftStatus: (id: string, status: "pending" | "fulfilled" | "cancelled", notes?: string) =>
      post<{ gift: MerchantGiftFulfillment }>(`/api/admin/merchant/gifts/${encodeURIComponent(id)}/status`, { status, notes }),

    promotionOverview: () => request<{ overview: PromotionOverview }>("/api/admin/promotions/overview"),
    promotions: () => request<{ promotions: Promotion[]; serverNow: string }>("/api/admin/promotions"),
    promotion: (id: string) => request<{ promotion: Promotion; serverNow: string }>(`/api/admin/promotions/${encodeURIComponent(id)}`),
    createPromotion: (body: Record<string, unknown>) => post<{ promotion: Promotion }>("/api/admin/promotions", body),
    updatePromotion: (id: string, body: Record<string, unknown>) =>
      post<{ promotion: Promotion }>(`/api/admin/promotions/${encodeURIComponent(id)}`, body),
    setPromotionStatus: (id: string, status: "draft" | "published" | "closed") =>
      post<{ promotion: Promotion }>(`/api/admin/promotions/${encodeURIComponent(id)}/status`, { status }),
    setPromotionBanner: (id: string, data: { filename: string; mime: string; bytesBase64: string }) =>
      post<{ promotion: Promotion }>(`/api/admin/promotions/${encodeURIComponent(id)}/banner`, data),
    promotionQualifications: (promotionId?: string) =>
      request<{ qualifications: PromotionQualification[] }>(
        `/api/admin/promotions/qualifications${promotionId ? `?promotionId=${encodeURIComponent(promotionId)}` : ""}`,
      ),
    promotionQualification: (id: string) =>
      request<{ qualification: PromotionQualification }>(`/api/admin/promotions/qualifications/${encodeURIComponent(id)}`),
    promotionRewards: (status?: string) =>
      request<{ rewards: PromotionFulfillment[] }>(
        `/api/admin/promotions/rewards${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
    setPromotionRewardStatus: (id: string, status: PromotionFulfillment["status"], reason?: string) =>
      post<{ reward: PromotionFulfillment }>(`/api/admin/promotions/rewards/${encodeURIComponent(id)}/status`, { status, reason }),
  },
};
