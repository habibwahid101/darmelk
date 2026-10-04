import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { api, type Promotion, type PromotionReward } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { PromotionCountdown } from "@/components/promotions/countdown";
import { PromotionBanner } from "@/components/promotions/promotion-banner";

function rewardLine(reward: PromotionReward) {
  return reward.quantity > 1 ? `${reward.quantity} × ${reward.name}` : reward.name;
}

function eligibleCopy(promo: Promotion) {
  if (promo.offer_scope === "all") {
    return { label: "Eligible property", value: "Any current Darmelk property booking" };
  }
  if (promo.offers.length <= 1) {
    return { label: "Eligible property", value: promo.offers[0]?.title ?? "Selected properties" };
  }
  return {
    label: "Eligible properties",
    value: promo.offers.map((offer) => offer.title).join(" · "),
  };
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold leading-snug text-pretty">{value}</p>
    </div>
  );
}

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

  const rewards = primary.rewards;
  const scope = eligibleCopy(primary);

  return (
    <Surface className="overflow-hidden p-0 sm:p-0">
      {primary.has_banner ? <PromotionBanner id={primary.id} title={primary.title} framed /> : null}
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.65fr)_minmax(14.5rem,0.92fr)] md:items-start md:gap-8 md:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-pine">Current promotion</p>
          <h2 className="mt-1.5 max-w-2xl text-pretty font-display text-[1.45rem] font-semibold leading-snug sm:text-2xl">
            {primary.title}
          </h2>
          {primary.short_description ? (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted text-pretty">{primary.short_description}</p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-6">
            {rewards.length > 0 ? (
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
                  {rewards.length > 1 ? "Rewards" : "Reward"}
                </p>
                <ul className="mt-1 space-y-1">
                  {rewards.map((reward, index) => (
                    <li key={reward.id ?? `${reward.name}-${index}`} className="font-display text-lg font-semibold leading-snug text-pretty">
                      {rewardLine(reward)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <MetaBlock label={scope.label} value={scope.value} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 border-t border-line pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Time remaining</p>
            <div className="mt-2.5">
              <PromotionCountdown
                endAt={primary.end_at}
                serverNow={data?.serverNow}
                onExpired={() => setExpiredIds((ids) => (ids.includes(primary.id) ? ids : [...ids, primary.id]))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <Button asChild className="w-full">
              <Link to="/app/promotions/$id" params={{ id: primary.id }}>
                View details
              </Link>
            </Button>
            {more.length > 0 ? (
              <Link to="/app/promotions" className="text-center text-sm font-medium text-pine underline-offset-2 hover:underline">
                More promotions ({more.length})
              </Link>
            ) : null}
            <Link
              to="/terms"
              search={{ key: "promotion" }}
              className="text-center text-sm font-medium text-pine underline-offset-2 hover:underline"
            >
              Promotion Terms
            </Link>
          </div>
        </div>
      </div>
    </Surface>
  );
}
