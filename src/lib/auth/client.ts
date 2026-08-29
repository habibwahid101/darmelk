import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to the Darmelk backend Lambda (API Gateway), NOT this app's own
 * origin — the private RDS database is only reachable from inside the AWS
 * VPC, so all persistence (auth included) lives in that Lambda. Cross-origin
 * requests always send cookies (`credentials: "include"`); the backend sets
 * SameSite=None;Secure session cookies (and, once a custom `api.darmelk.com`
 * domain is wired up, a shared `.darmelk.com` cookie domain) to make that work.
 *
 * `VITE_API_URL` is set in the Vercel project's environment variables to the
 * backend's public URL (API Gateway invoke URL, or the custom domain once
 * DNS is in place).
 */
const API_URL = import.meta.env.VITE_API_URL ?? "";

export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  fetchOptions: {
    credentials: "include",
  },
});

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`.
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/**
 * Sign out of the Darmelk session and redirect. `<UserButton />` (see
 * `gates.tsx`) already calls this; a hand-rolled control should too, rather
 * than calling `authClient.signOut()` directly, so failures surface the same
 * way everywhere.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  if (typeof window !== "undefined") window.location.href = redirectTo;
}

/**
 * Historical hook for `src/lib/auth/middleware.ts` (unused TanStack Start
 * server-function middleware, kept dormant — see that file's header). The
 * self-hosted Better Auth session here always rides a same-site cookie, so
 * there is no separate bearer token to forward; this stub keeps that dead
 * code path type-checking without resurrecting it.
 */
export function getBearerToken(): string | undefined {
  return undefined;
}
