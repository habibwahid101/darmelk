// Self-hosted Better Auth for the Darmelk backend Lambda.
//
// Runs standalone against the private RDS Postgres instance — no external
// identity broker, no Cognito. Email/password only for now (matches the
// frontend's already-built sign-up/sign-in forms). The session cookie's
// Domain is set to the parent domain (e.g. ".darmelk.com") when
// COOKIE_DOMAIN is configured, so the Vercel-hosted frontend
// (darmelk.com) and this API (api.darmelk.com) share first-party session
// cookies. Falls back to host-only cookies (still works, but then the
// browser must be willing to send a cross-site cookie) when no custom API
// domain is wired up yet.
import { betterAuth } from "better-auth";
import { Pool } from "pg";

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v ? v : undefined;
}

const databaseUrl = env("DATABASE_URL");
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const baseURL = env("BETTER_AUTH_URL"); // e.g. https://api.darmelk.com
const cookieDomain = env("COOKIE_DOMAIN"); // e.g. .darmelk.com

const trustedOrigins = (env("TRUSTED_ORIGINS") ?? "https://darmelk.com,https://www.darmelk.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
  ...(baseURL ? { baseURL } : {}),
  secret: env("BETTER_AUTH_SECRET"),
  database: new Pool({ connectionString: databaseUrl }),
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    // Real password-reset delivery via SES; see backend/src/email.ts. If SES
    // is not reachable (e.g. the VPC endpoint isn't provisioned yet), this
    // logs instead of throwing so sign-up/sign-in keep working.
    sendResetPassword: async ({ user, url }) => {
      const { sendMail } = await import("./email.js");
      await sendMail({
        to: user.email,
        subject: "Reset your Darmelk password",
        text: `Reset your password: ${url}\n\nIf you did not request this, ignore this email.`,
      });
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 300 },
  },
  advanced: {
    // Cross-origin either way: the frontend (darmelk.com, on Vercel) and this
    // API are always on different origins unless COOKIE_DOMAIN is wired up
    // (api.darmelk.com under the same parent domain), so the session cookie
    // needs SameSite=None;Secure to ride along on fetch() calls with
    // credentials:'include' regardless. crossSubDomainCookies additionally
    // sets Domain=COOKIE_DOMAIN once that custom domain exists, upgrading to
    // a true first-party cookie shared between the two subdomains.
    defaultCookieAttributes: { sameSite: "none", secure: true, partitioned: true },
    ...(cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : {}),
  },
});

export type Auth = typeof auth;
