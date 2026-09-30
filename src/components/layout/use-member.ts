import { useCurrentUserState, type AppUser } from "@/lib/auth/use-current-user";
import { api, type Member, type MerchantSummary } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

/**
 * Current member profile from GET /api/me.
 * A signed-in identity with no members row stays incomplete until registration
 * finishes with an active Referral ID. Existing members are not rewritten.
 */
export function useMemberSession(): {
  user: AppUser | null;
  member: Member | undefined;
  merchant: MerchantSummary | null | undefined;
  incompleteRegistration: boolean;
  isPending: boolean;
  reload: () => void;
} {
  const { user, isPending: sessionPending } = useCurrentUserState();
  const { data, error, reload } = useAsync(() => api.me(), [user?.id], { enabled: Boolean(user) });

  return {
    user,
    member: data?.member ?? undefined,
    merchant: data?.merchant,
    incompleteRegistration: data?.incompleteRegistration === true && !data.member,
    // When auth resolves on a hard load, useAsync's enabling effect has not
    // started yet during that render. Keep the route gated until /api/me has
    // either returned or failed, otherwise a valid session flashes to /login.
    isPending: sessionPending || (Boolean(user) && !data && !error),
    reload,
  };
}