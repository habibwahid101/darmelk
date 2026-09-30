export const REFERRAL_ORIGIN = "https://darmelk.com";

/** Must match backend DARMELK_REFERRAL_HEADER. Validated server-side; never stored as a Better Auth profile field. */
export const DARMELK_REFERRAL_HEADER = "x-darmelk-referral";

export function referralLinkFor(code: string, origin?: string): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : REFERRAL_ORIGIN)).replace(/\/$/, "");
  return `${base}/join/${encodeURIComponent(code.trim().toUpperCase())}`;
}

export function referralShareText(link: string): string {
  return `Join Darmelk using my referral link:\n${link}`;
}
