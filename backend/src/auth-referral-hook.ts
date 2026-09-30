import { APIError, createAuthMiddleware } from "better-auth/api";
import { ApiError } from "./errors.js";
import { DARMELK_REFERRAL_HEADER } from "./referral-messages.js";

export { DARMELK_REFERRAL_HEADER } from "./referral-messages.js";

function isEmailSignUp(path: string | undefined): boolean {
  const bare = (path ?? "").split("?")[0] ?? "";
  return bare === "/sign-up/email" || bare.endsWith("/sign-up/email");
}

/**
 * Runs before the email sign-up handler. `validate` must reject missing,
 * unknown, inactive, and expired referrals. A throw here happens before
 * Better Auth inserts the user, credential, or session.
 */
export function referralSignupHook(validate: (code: string) => Promise<void>) {
  return createAuthMiddleware(async (ctx) => {
    if (!isEmailSignUp(ctx.path)) return;
    const headers = ctx.headers ?? ctx.request?.headers;
    const code = headers?.get(DARMELK_REFERRAL_HEADER) ?? "";
    try {
      await validate(code);
    } catch (err) {
      if (err instanceof ApiError) {
        throw APIError.from("BAD_REQUEST", { message: err.message, code: err.code });
      }
      throw err;
    }
  });
}
