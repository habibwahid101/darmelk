import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMemberSession } from "@/components/layout/use-member";
import { COMMISSION_LEVELS, FLAGSHIP, formatBdt } from "@/lib/offers";
import { PERSONAL_SPONSOR_TARGET } from "@/lib/platform";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/app/qualification")({
  component: QualificationPage,
});

function QualificationPage() {
  const { member } = useMemberSession();
  const { data } = useAsync(() => api.myQualification(), [member?.user_id], { enabled: Boolean(member) });
  if (!member) return null;

  const counts = data?.levelCounts ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const qualified = data?.qualified ?? false;
  const own = data?.ownBooking ?? null;
  const l5 = COMMISSION_LEVELS[4];
  const remainingDirects = Math.max(0, PERSONAL_SPONSOR_TARGET - (data?.sponsorCount ?? 0));
  const remainingL5 = Math.max(0, l5.positions - (counts[5] ?? 0));

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Qualification"
        title="Qualification Benefit"
        description="Personally sponsor 3 eligible members and complete Level 5. The benefit comes from your own booked offer."
        action={<StatusBadge status={qualified ? "qualified" : "not-qualified"} />}
      />

      <Surface><p className="text-xs font-medium uppercase tracking-wide text-subtle">Gate 1 — Personal Sponsors</p><div className="mt-3 flex items-baseline justify-between"><h2 className="font-display text-2xl font-semibold">{data?.sponsorCount??0} / {PERSONAL_SPONSOR_TARGET} confirmed</h2><StatusBadge status={remainingDirects?"in-progress":"complete"}/></div><div className="mt-5 grid grid-cols-3 gap-3">{[0,1,2].map(i=><div key={i} className="rounded-xl bg-mist p-4 text-center text-sm">{i<(data?.sponsorCount??0)?"Confirmed member":"Waiting on a personal confirmed member/booking"}</div>)}</div></Surface>

      <Surface><p className="text-xs font-medium uppercase tracking-wide text-subtle">Gate 2 — Five-Level Progress</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[24rem] text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase tracking-wide text-subtle"><th className="py-3">Level</th><th className="py-3 text-right">Filled</th><th className="py-3 text-right">Capacity</th></tr></thead><tbody>{COMMISSION_LEVELS.map(level=><tr key={level.level} className="border-b border-line last:border-0"><td className="py-3 font-medium">Level {level.level}</td><td className="py-3 text-right tabular-nums">{counts[level.level]??0}</td><td className="py-3 text-right tabular-nums">{level.positions}</td></tr>)}</tbody></table></div><p className="mt-4 text-sm text-muted">Status: <span className="font-medium text-ink">{qualified?"Qualified":"In Progress"}</span></p></Surface>

      <Surface>
        <h2 className="font-display text-xl font-semibold">Attached benefit</h2>
        {own ? (
          <>
            <p className="mt-2 font-medium">{own.offer_title ?? own.offer_slug}</p>
            <p className="mt-1 whitespace-nowrap font-display text-3xl font-semibold tabular-nums">
              {formatBdt(own.qualification_benefit)}
            </p>
            <p className="mt-2 text-sm text-muted">
              This amount belongs to the offer you booked. It is not a universal Darmelk figure.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Book an offer to attach a qualification benefit. Until then there is no benefit amount to display.
            </p>
            <Button asChild className="mt-4">
              <Link to="/properties/$slug" params={{ slug: FLAGSHIP.slug }}>
                View a published offer
              </Link>
            </Button>
          </>
        )}
      </Surface>

      <p className="text-sm text-muted">Remaining: {remainingDirects} personal sponsors and {remainingL5} Level 5 positions. Both gates must be complete.</p>
    </div>
  );
}
