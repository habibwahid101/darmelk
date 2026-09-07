import { formatBdt } from "@/lib/offers";

export const TIER_25K = 25_000;
export const TIER_50K = 50_000;
export const TIER_100K = 100_000;
export const LEVEL5_CAPACITY = 243;

export function monthLabel(monthStart: string | null | undefined): string {
  if (!monthStart) return "—";
  const [year, month] = monthStart.slice(0, 10).split("-").map(Number);
  if (!year || !month) return monthStart;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthRangeLabel(start: string, end: string) {
  return `${monthLabel(start)} – ${monthLabel(end)}`;
}

export function tierLabel(amount: number | null | undefined) {
  if (!amount) return "—";
  return `${formatBdt(amount)} / month`;
}
