import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { EmptyState, PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { PromotionCountdown } from "@/components/promotions/countdown";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/promotions/")({
  component: MemberPromotionsPage,
});

function MemberPromotionsPage() {
  const { data, loading } = useAsync(() => api.promotions(), []);
  const promotions = data?.promotions ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Promotions"
        title="Current promotions"
        description="Complete an eligible confirmed Darmelk property booking inside the campaign window to qualify. Darmelk Bank and Pay by Merchant bookings are treated the same way after confirmation. Creating a booking, submitting payment, Merchant approval, or a Request to Book is not enough."
      />
      <p className="text-sm text-muted">
        <Link to="/terms" search={{ key: "promotion" }} className="font-medium text-pine underline-offset-2 hover:underline">
          Read Promotion Terms
        </Link>
      </p>
      {loading && !data ? (
        <p className="text-sm text-muted">Loading promotions…</p>
      ) : promotions.length === 0 ? (
        <EmptyState icon={Megaphone} title="No current promotions" description="When a campaign is active, it will appear here and on your overview." />
      ) : (
        <ul className="grid gap-3">
          {promotions.map((promo) => {
            const rewardSummary = promo.rewards.map((r) => (r.quantity > 1 ? `${r.quantity} × ${r.name}` : r.name)).join(" · ");
            const scope =
              promo.offer_scope === "all"
                ? "Any current Darmelk property booking"
                : promo.offers.length === 1
                  ? promo.offers[0]!.title
                  : `${promo.offers.length} eligible properties`;
            return (
              <li key={promo.id}>
                <Surface>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-display text-xl font-semibold">{promo.title}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{promo.short_description || rewardSummary}</p>
                      <p className="mt-2 text-sm text-muted">Eligible: {scope}</p>
                    </div>
                    <StatusBadge status={promo.lifecycle} />
                  </div>
                  {promo.lifecycle === "active" ? (
                    <div className="mt-4 max-w-md">
                      <PromotionCountdown endAt={promo.end_at} serverNow={data?.serverNow} />
                    </div>
                  ) : null}
                  <Link
                    to="/app/promotions/$id"
                    params={{ id: promo.id }}
                    className="mt-4 inline-flex text-sm font-medium text-pine underline-offset-2 hover:underline"
                  >
                    View details
                  </Link>
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
