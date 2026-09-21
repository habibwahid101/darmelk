export const REFERRAL_ORIGIN = "https://darmelk.com";

export function referralLinkFor(code: string, origin?: string): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : REFERRAL_ORIGIN)).replace(/\/$/, "");
  return `${base}/join/${encodeURIComponent(code.trim().toUpperCase())}`;
}

export function referralShareText(link: string): string {
  return `Join Darmelk using my referral link:\n${link}`;
}
