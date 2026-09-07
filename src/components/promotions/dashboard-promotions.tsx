import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { PromotionCountdown } from "@/components/promotions/countdown";

export function DashboardPromotions({ userId }: { userId?: string }) {
  const { data } = useAsync(() => api.myPromotions(), [userId], { enabled: Boolean(userId) });
  const [expiredIds, setExpiredIds] = useState<string[]>([]);
  const actives = [data?.primary, ...(data?.more ?? [])].filter((p): p is NonNullable<typeof p> => Boolean(p));
  const remaining = actives.filter((p) => !expiredIds.includes(p.id));
  const primary = remaining[0];
  const more = remaining.slice(1);
  if (!primary) {
    return null;
  }

  const rewardSummary = primary.rewards.map((r) => (r.quantity > 1 ? `${r.quantity} × ${r.name}` : r.name)).join(" · ");
  const scope =
    primary.offer_scope === "all"
      ? "Any current Darmelk property booking"
      : primary.offers.length === 1
        ? primary.offers[0]!.title
        : `${primary.offers.length} eligible properties`;

  return (
    <Surface>
      <div className="grid gap-5 md:grid-cols-[minmax(0,11rem)_1fr] md:items-start">
        {primary.has_banner ? (
          <img
            src={api.promotionBannerUrl(primary.id)}
            alt=""
            className="aspect-[4/3] w-full rounded-xl object-cover md:h-28 md:w-44"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-pine">Current promotion</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">{primary.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{primary.short_description || rewardSummary}</p>
          <p className="mt-3 text-sm text-muted">Eligible: {scope}</p>
          <div className="mt-4 max-w-md">
            <PromotionCountdown endAt={primary.end_at} serverNow={data?.serverNow} onExpired={() => setExpiredIds((ids) => (ids.includes(primary.id) ? ids : [...ids, primary.id]))} />
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="sm">
              <Link to="/app/promotions/$id" params={{ id: primary.id }}>
                View details
              </Link>
            </Button>
            {more.length > 0 ? (
              <Link to="/app/promotions" className="text-sm font-medium text-pine underline-offset-2 hover:underline">
                More promotions ({more.length})
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </Surface>
  );
}
