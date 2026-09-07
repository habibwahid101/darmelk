import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PromotionCountdown } from "@/components/promotions/countdown";
import { api } from "@/lib/api-client";
import { formatWhen } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/promotions/campaigns/$id/preview")({
  component: AdminPreviewPromotion,
});

function AdminPreviewPromotion() {
  const { id } = Route.useParams();
  const { data } = useAsync(() => api.admin.promotion(id), [id]);
  const promotion = data?.promotion;
  if (!promotion) return <p className="text-sm text-muted">Loading preview…</p>;
  const scope =
    promotion.offer_scope === "all"
      ? "Any current Darmelk property booking"
      : promotion.offers.map((o) => o.title).join(", ");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        kicker="Preview"
        title={promotion.title}
        description="This is the member-facing campaign. Drafts remain hidden from members."
        action={
          <Button asChild size="sm" variant="secondary">
            <Link to="/admin/promotions/campaigns/$id" params={{ id }}>
              Back to edit
            </Link>
          </Button>
        }
      />
      <StatusBadge status={promotion.lifecycle} />
      {promotion.has_banner ? (
        <img src={api.promotionBannerUrl(promotion.id)} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
      ) : null}
      <Surface>
        <p className="text-sm leading-relaxed text-muted">{promotion.short_description || promotion.description}</p>
        <p className="mt-4 text-sm">Eligible properties: {scope || "None selected"}</p>
        <p className="mt-2 text-sm text-muted">
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
        <ul className="mt-3 space-y-2 text-sm">
          {promotion.rewards.map((reward, i) => (
            <li key={i}>
              {reward.quantity} × {reward.name}
              {reward.description ? <span className="text-muted"> — {reward.description}</span> : null}
            </li>
          ))}
        </ul>
      </Surface>
      {promotion.terms ? (
        <Surface>
          <h2 className="font-display text-xl font-semibold">Terms & Conditions</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{promotion.terms}</p>
        </Surface>
      ) : null}
    </div>
  );
}
