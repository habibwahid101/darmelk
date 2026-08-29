import { useCurrentUserState, type AppUser } from "@/lib/auth/use-current-user";
import { api, type Member } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

/**
 * Current member profile, backed by the real Darmelk API (`GET /api/me`),
 * which also auto-provisions the `members` row on first contact. Replaces
 * the old zustand-store `useMemberSession`.
 */
export function useMemberSession(): { user: AppUser | null; member: Member | undefined; isPending: boolean; reload: () => void } {
  const { user, isPending: sessionPending } = useCurrentUserState();
  const { data, loading, reload } = useAsync(() => api.me(), [user?.id], { enabled: Boolean(user) });

  return {
    user,
    member: data?.member,
    isPending: sessionPending || (Boolean(user) && loading && !data),
    reload,
  };
}
