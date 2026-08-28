import { create } from "zustand";
import { persist } from "zustand/middleware";
import { COMMISSION_LEVELS, TOTAL_POSITIONS, type PropertyOffer } from "@/lib/offers";
import type { AppUser } from "@/lib/auth/use-current-user";

export const PERSONAL_SPONSOR_TARGET = 3;
export const ACTIVATION_FEE = 1000;
export const MAX_LEVEL = 5;

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "activated"
  | "cancelled"
  | "reversed";

export type CommissionStatus =
  | "available"
  | "pending"
  | "paid"
  | "reversed"
  | "rejected";

export type ActivationStatus = "inactive" | "pending" | "active" | "expired";
export type MemberRole = "member" | "admin";
export type TxType = "booking" | "commission" | "activation";
export type TxStatus = "pending" | "posted" | "reversed" | "rejected";

export type MemberProfile = {
  userId: string;
  email: string;
  name: string;
  phone: string;
  referralCode: string;
  sponsorUserId: string | null;
  sponsorCodeEntered: string;
  role: MemberRole;
  activationStatus: ActivationStatus;
  activationRequestedAt: string | null;
  activationExpiresAt: string | null;
  onboardingComplete: boolean;
  createdAt: string;
};

export type Booking = {
  id: string;
  userId: string;
  offerSlug: string;
  offerTitle: string;
  category: string;
  image: string;
  location?: string;
  retailValue: number;
  bookingAmount: number;
  qualificationBenefit: number;
  status: BookingStatus;
  createdAt: string;
  confirmedAt: string | null;
  activatedAt: string | null;
  cancelledAt: string | null;
};

export type Commission = {
  id: string;
  userId: string;
  sourceBookingId: string;
  sourceUserId: string;
  sourceOfferTitle: string;
  level: number;
  rate: number;
  bookingAmount: number;
  amount: number;
  status: CommissionStatus;
  createdAt: string;
};

export type Transaction = {
  id: string;
  userId: string;
  type: TxType;
  amount: number;
  status: TxStatus;
  reference: string;
  createdAt: string;
};

type PlatformState = {
  _hasHydrated: boolean;
  members: MemberProfile[];
  bookings: Booking[];
  commissions: Commission[];
  transactions: Transaction[];
  setHydrated: () => void;
  ensureMember: (user: AppUser) => MemberProfile;
  completeOnboarding: (
    userId: string,
    data: { name: string; phone: string; sponsorCode: string },
  ) => void;
  updateProfile: (
    userId: string,
    data: Partial<Pick<MemberProfile, "name" | "phone">>,
  ) => void;
  submitBooking: (userId: string, offer: PropertyOffer) => Booking;
  requestActivation: (userId: string) => void;
  adminSetBookingStatus: (bookingId: string, status: BookingStatus) => void;
  adminSetCommissionStatus: (id: string, status: CommissionStatus) => void;
  adminSetActivation: (userId: string, status: ActivationStatus) => void;
};

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function referralCodeFrom(userId: string) {
  const stem = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  return `PG-${stem || "MEMBER"}`;
}

function rateForLevel(level: number) {
  return COMMISSION_LEVELS.find((l) => l.level === level)?.rate ?? 0;
}

export const usePlatform = create<PlatformState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      members: [],
      bookings: [],
      commissions: [],
      transactions: [],
      setHydrated: () => set({ _hasHydrated: true }),
      ensureMember: (user) => {
        const existing = get().members.find((m) => m.userId === user.id);
        if (existing) {
          const email = user.primaryEmail ?? existing.email;
          const name = user.displayName ?? existing.name;
          if (email !== existing.email || name !== existing.name) {
            set({
              members: get().members.map((m) =>
                m.userId === user.id ? { ...m, email, name: existing.onboardingComplete ? existing.name : name } : m,
              ),
            });
          }
          return get().members.find((m) => m.userId === user.id)!;
        }
        const isFirst = get().members.length === 0;
        const profile: MemberProfile = {
          userId: user.id,
          email: user.primaryEmail ?? "",
          name: user.displayName ?? "Member",
          phone: "",
          referralCode: referralCodeFrom(user.id),
          sponsorUserId: null,
          sponsorCodeEntered: "",
          role: isFirst ? "admin" : "member",
          activationStatus: "inactive",
          activationRequestedAt: null,
          activationExpiresAt: null,
          onboardingComplete: false,
          createdAt: now(),
        };
        set({ members: [...get().members, profile] });
        return profile;
      },
      completeOnboarding: (userId, data) => {
        const code = data.sponsorCode.trim().toUpperCase();
        const sponsor = get().members.find(
          (m) => m.referralCode.toUpperCase() === code && m.userId !== userId,
        );
        set({
          members: get().members.map((m) =>
            m.userId === userId
              ? {
                  ...m,
                  name: data.name.trim() || m.name,
                  phone: data.phone.trim(),
                  sponsorCodeEntered: code,
                  sponsorUserId: sponsor?.userId ?? null,
                  onboardingComplete: true,
                }
              : m,
          ),
        });
      },
      updateProfile: (userId, data) => {
        set({
          members: get().members.map((m) =>
            m.userId === userId ? { ...m, ...data } : m,
          ),
        });
      },
      submitBooking: (userId, offer) => {
        const booking: Booking = {
          id: uid("bk"),
          userId,
          offerSlug: offer.slug,
          offerTitle: offer.title,
          category: offer.category,
          image: offer.image,
          location: offer.location,
          retailValue: offer.retailValue,
          bookingAmount: offer.bookingAmount,
          qualificationBenefit: offer.qualificationBenefit,
          status: "pending",
          createdAt: now(),
          confirmedAt: null,
          activatedAt: null,
          cancelledAt: null,
        };
        const tx: Transaction = {
          id: uid("tx"),
          userId,
          type: "booking",
          amount: offer.bookingAmount,
          status: "pending",
          reference: `${offer.title} · ${booking.id}`,
          createdAt: now(),
        };
        set({
          bookings: [booking, ...get().bookings],
          transactions: [tx, ...get().transactions],
        });
        return booking;
      },
      requestActivation: (userId) => {
        const member = get().members.find((m) => m.userId === userId);
        if (!member || member.activationStatus === "active" || member.activationStatus === "pending") {
          return;
        }
        const tx: Transaction = {
          id: uid("tx"),
          userId,
          type: "activation",
          amount: ACTIVATION_FEE,
          status: "pending",
          reference: "Annual activation",
          createdAt: now(),
        };
        set({
          members: get().members.map((m) =>
            m.userId === userId
              ? {
                  ...m,
                  activationStatus: "pending",
                  activationRequestedAt: now(),
                }
              : m,
          ),
          transactions: [tx, ...get().transactions],
        });
      },
      adminSetBookingStatus: (bookingId, status) => {
        const prev = get().bookings.find((b) => b.id === bookingId);
        if (!prev) return;
        const next: Booking = {
          ...prev,
          status,
          confirmedAt:
            status === "confirmed" || status === "activated"
              ? prev.confirmedAt ?? now()
              : prev.confirmedAt,
          activatedAt: status === "activated" ? now() : prev.activatedAt,
          cancelledAt:
            status === "cancelled" || status === "reversed" ? now() : prev.cancelledAt,
        };
        let commissions = get().commissions;
        let transactions = get().transactions.map((t) =>
          t.reference.includes(bookingId)
            ? {
                ...t,
                status:
                  status === "confirmed" || status === "activated"
                    ? ("posted" as const)
                    : status === "reversed"
                      ? ("reversed" as const)
                      : status === "cancelled"
                        ? ("rejected" as const)
                        : t.status,
              }
            : t,
        );

        if (status === "confirmed" && prev.status === "pending") {
          const member = get().members.find((m) => m.userId === prev.userId);
          const created = creditUplineCommissions(get().members, prev, member);
          commissions = [...created.commissions, ...commissions];
          transactions = [...created.transactions, ...transactions];
        }

        if (status === "reversed" || status === "cancelled") {
          commissions = commissions.map((c) =>
            c.sourceBookingId === bookingId && c.status !== "reversed"
              ? { ...c, status: "reversed" }
              : c,
          );
        }

        set({ bookings: get().bookings.map((b) => (b.id === bookingId ? next : b)), commissions, transactions });
      },
      adminSetCommissionStatus: (id, status) => {
        set({
          commissions: get().commissions.map((c) => (c.id === id ? { ...c, status } : c)),
          transactions: get().transactions.map((t) =>
            t.reference.includes(id)
              ? {
                  ...t,
                  status:
                    status === "paid" || status === "available"
                      ? "posted"
                      : status === "reversed"
                        ? "reversed"
                        : status === "rejected"
                          ? "rejected"
                          : t.status,
                }
              : t,
          ),
        });
      },
      adminSetActivation: (userId, status) => {
        const expires =
          status === "active"
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            : null;
        set({
          members: get().members.map((m) =>
            m.userId === userId
              ? {
                  ...m,
                  activationStatus: status,
                  activationExpiresAt: expires,
                }
              : m,
          ),
          transactions: get().transactions.map((t) =>
            t.userId === userId && t.type === "activation"
              ? {
                  ...t,
                  status:
                    status === "active"
                      ? "posted"
                      : status === "expired" || status === "inactive"
                        ? "rejected"
                        : t.status,
                }
              : t,
          ),
        });
      },
    }),
    {
      name: "property-gateway.platform.v1",
      partialize: (s) => ({
        members: s.members,
        bookings: s.bookings,
        commissions: s.commissions,
        transactions: s.transactions,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

function creditUplineCommissions(
  members: MemberProfile[],
  booking: Booking,
  member: MemberProfile | undefined,
) {
  const commissions: Commission[] = [];
  const transactions: Transaction[] = [];
  let current = member;
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const sponsorId = current?.sponsorUserId;
    if (!sponsorId) break;
    const rate = rateForLevel(level);
    const amount = Math.round(booking.bookingAmount * rate);
    const commission: Commission = {
      id: uid("cm"),
      userId: sponsorId,
      sourceBookingId: booking.id,
      sourceUserId: booking.userId,
      sourceOfferTitle: booking.offerTitle,
      level,
      rate,
      bookingAmount: booking.bookingAmount,
      amount,
      status: "pending",
      createdAt: now(),
    };
    commissions.push(commission);
    transactions.push({
      id: uid("tx"),
      userId: sponsorId,
      type: "commission",
      amount,
      status: "pending",
      reference: `L${level} · ${booking.offerTitle} · ${commission.id}`,
      createdAt: now(),
    });
    current = members.find((m) => m.userId === sponsorId);
  }
  return { commissions, transactions };
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function memberById(members: MemberProfile[], userId: string | null | undefined) {
  if (!userId) return undefined;
  return members.find((m) => m.userId === userId);
}

export function memberByCode(members: MemberProfile[], code: string) {
  const c = code.trim().toUpperCase();
  if (!c) return undefined;
  return members.find((m) => m.referralCode.toUpperCase() === c);
}

function hasEligibleBooking(bookings: Booking[], userId: string) {
  return bookings.some(
    (b) => b.userId === userId && (b.status === "confirmed" || b.status === "activated"),
  );
}

export function getDirects(members: MemberProfile[], bookings: Booking[], userId: string) {
  return members.filter(
    (m) => m.sponsorUserId === userId && hasEligibleBooking(bookings, m.userId),
  );
}

export function getLevelCounts(members: MemberProfile[], bookings: Booking[], userId: string) {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let frontier = getDirects(members, bookings, userId).map((m) => m.userId);
  counts[1] = frontier.length;
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of getDirects(members, bookings, id)) {
        next.push(child.userId);
      }
    }
    counts[level] = next.length;
    frontier = next;
  }
  return counts;
}

export function networkFilled(counts: Record<number, number>) {
  return COMMISSION_LEVELS.reduce((sum, l) => sum + (counts[l.level] ?? 0), 0);
}

export function isQualified(members: MemberProfile[], bookings: Booking[], userId: string) {
  const counts = getLevelCounts(members, bookings, userId);
  const directs = counts[1] ?? 0;
  const level5Complete = (counts[5] ?? 0) >= (COMMISSION_LEVELS[4]?.positions ?? 243);
  return directs >= PERSONAL_SPONSOR_TARGET && level5Complete;
}

export function ownQualificationOffer(bookings: Booking[], userId: string) {
  return bookings
    .filter((b) => b.userId === userId && (b.status === "confirmed" || b.status === "activated"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

export function commissionTotals(commissions: Commission[], userId: string) {
  const mine = commissions.filter((c) => c.userId === userId);
  const sum = (status: CommissionStatus | CommissionStatus[]) => {
    const set = Array.isArray(status) ? status : [status];
    return mine.filter((c) => set.includes(c.status)).reduce((n, c) => n + c.amount, 0);
  };
  return {
    available: sum("available"),
    pending: sum("pending"),
    paid: sum("paid"),
    reversed: sum("reversed"),
    rejected: sum("rejected"),
    all: mine,
  };
}

export function primaryBooking(bookings: Booking[], userId: string) {
  const mine = bookings.filter((b) => b.userId === userId);
  return (
    mine.find((b) => b.status === "activated") ||
    mine.find((b) => b.status === "confirmed") ||
    mine.find((b) => b.status === "pending") ||
    mine[0]
  );
}

export { TOTAL_POSITIONS };
