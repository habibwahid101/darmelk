import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { PromotionCountdown } from "@/components/promotions/countdown";
import { useMemberSession } from "@/components/layout/use-member";
import { api } from "@/lib/api-client";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/promotions/$id")({
  component: MemberPromotionDetails,
});

function memberState(
  lifecycle: string,
  qualification: { fulfillments?: Array<{ status: string }> } | null,
): { label: string; status: string } {
  if (qualification) {
    const fulfillments = qualification.fulfillments ?? [];
    if (fulfillments.length > 0 && fulfillments.every((f) => f.status === "fulfilled")) {
      return { label: "Reward Fulfilled", status: "fulfilled" };
    }
    if (fulfillments.some((f) => f.status === "approved")) {
      return { label: "Reward Pending", status: "approved" };
    }
    if (fulfillments.some((f) => f.status === "eligible")) {
      return { label: "Qualified", status: "qualified" };
    }
    if (fulfillments.every((f) => f.status === "cancelled" || f.status === "reversed") && fulfillments.length > 0) {
      return { label: "Qualified", status: "qualified" };
    }
    return { label: "Qualified", status: "qualified" };
  }
  if (lifecycle === "expired") return { label: "Promotion Expired", status: "expired" };
  if (lifecycle === "closed") return { label: "Closed", status: "closed" };
  if (lifecycle === "upcoming") return { label: "Not Yet Qualified", status: "upcoming" };
  return { label: "Not Yet Qualified", status: "not-qualified" };
}

function MemberPromotionDetails() {
  const { id } = Route.useParams();
  const { member } = useMemberSession();
  const { data, loading, error } = useAsync(() => api.promotion(id), [id, member?.user_id]);
  const promotion = data?.promotion;
  const qualification = data?.myQualification ?? null;

  if (loading && !promotion) return <p className="text-sm text-muted">Loading promotion…</p>;
  if (error || !promotion) {
    return (
      <div className="space-y-4">
        <PageHeader kicker="Promotions" title="Promotion unavailable" description="This campaign is not available." />
        <Link to="/app/promotions" className="text-sm font-medium text-pine underline-offset-2 hover:underline">
          Back to promotions
        </Link>
      </div>
    );
  }

  const state = memberState(promotion.lifecycle, qualification);
  const scope =
    promotion.offer_scope === "all"
      ? "Any current Darmelk property booking"
      : promotion.offers.map((o) => o.title).join(", ") || "Selected properties";

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Promotions"
        title={promotion.title}
        description={promotion.short_description || "A Darmelk booking campaign."}
        action={<StatusBadge status={promotion.lifecycle} />}
      />
      {promotion.has_banner ? (
        <img src={api.promotionBannerUrl(promotion.id)} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
      ) : null}

      <Surface>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Your status</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={state.status} />
          <p className="text-sm font-medium">{state.label}</p>
        </div>
        {qualification ? (
          <div className="mt-4 space-y-1 text-sm text-muted">
            <p>Qualified on {formatWhen(qualification.qualified_at)}</p>
            <p className="break-all">Qualifying booking: {qualification.booking_id}</p>
            <p>
              {qualification.offer_title} · confirmed {formatWhen(qualification.booking_confirmed_at)}
            </p>
          </div>
        ) : (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Qualification requires your own confirmed or activated booking on an eligible property, with the
            confirmation time inside this campaign window. Creating a booking, pending payment, or Merchant approval
            alone does not qualify.
          </p>
        )}
      </Surface>

      {promotion.description ? (
        <Surface>
          <h2 className="font-display text-xl font-semibold">About this promotion</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{promotion.description}</p>
        </Surface>
      ) : null}

      <Surface>
        <h2 className="font-display text-xl font-semibold">Eligible properties</h2>
        <p className="mt-3 text-sm text-muted">{scope}</p>
        {promotion.offer_scope === "selected" && promotion.offers.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {promotion.offers.map((offer) => (
              <li key={offer.slug}>
                <Link
                  to="/properties/$slug"
                  params={{ slug: offer.slug }}
                  className="font-medium text-pine underline-offset-2 hover:underline"
                >
                  {offer.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Promotion period</h2>
        <p className="mt-3 text-sm text-muted">
          {formatWhen(promotion.start_at)} – {formatWhen(promotion.end_at)}
        </p>
        {promotion.lifecycle === "active" ? (
          <div className="mt-5 max-w-md">
            <PromotionCountdown endAt={promotion.end_at} serverNow={data?.serverNow} />
          </div>
        ) : null}
      </Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Rewards</h2>
        <ul className="mt-4 space-y-3">
          {(qualification?.fulfillments?.length ? qualification.fulfillments : promotion.rewards).map((reward, i) => {
            const name = "reward_name" in reward ? reward.reward_name : reward.name;
            const description = "reward_description" in reward ? reward.reward_description : reward.description;
            const status = "status" in reward ? reward.status : undefined;
            return (
              <li key={"id" in reward && reward.id ? reward.id : `${name}-${i}`} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {reward.quantity > 1 ? `${reward.quantity} × ${name}` : name}
                  </p>
                  {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
                </div>
                {status ? <StatusBadge status={status} /> : null}
              </li>
            );
          })}
        </ul>
      </Surface>

      {promotion.terms ? (
        <Surface>
          <h2 className="font-display text-xl font-semibold">Terms & Conditions</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{qualification?.terms_snapshot ?? promotion.terms}</p>
        </Surface>
      ) : null}

      <Link to="/app/promotions" className="inline-flex text-sm font-medium text-pine underline-offset-2 hover:underline">
        All promotions
      </Link>
    </div>
  );
}
