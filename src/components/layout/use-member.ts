import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { usePlatform } from "@/lib/platform";

export function useHydratedPlatform() {
  const hydrated = usePlatform((s) => s._hasHydrated);
  const setHydrated = usePlatform((s) => s.setHydrated);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!usePlatform.getState()._hasHydrated) setHydrated();
    }, 80);
    return () => window.clearTimeout(t);
  }, [setHydrated]);
  return hydrated;
}

export function useMemberSession() {
  const { user, isPending } = useCurrentUserState();
  const hydrated = useHydratedPlatform();
  const ensureMember = usePlatform((s) => s.ensureMember);
  const member = usePlatform((s) =>
    user ? s.members.find((m) => m.userId === user.id) : undefined,
  );

  useEffect(() => {
    if (user && hydrated) ensureMember(user);
  }, [user, hydrated, ensureMember]);

  return {
    user,
    member,
    isPending: isPending || Boolean(user && (!hydrated || !member)),
  };
}
