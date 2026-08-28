import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { COMMISSION_LEVELS, TOTAL_POSITIONS } from "@/lib/offers";
import {
  getDirects,
  getLevelCounts,
  isQualified,
  PERSONAL_SPONSOR_TARGET,
  usePlatform,
} from "@/lib/platform";

export const Route = createFileRoute("/admin/network")({
  component: AdminNetwork,
});

function AdminNetwork() {
  const members = usePlatform((s) => s.members);
  const bookings = usePlatform((s) => s.bookings);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Progress"
        title="Network & qualification"
        description={`Verify personal sponsors (${PERSONAL_SPONSOR_TARGET}) and level fill. Level 5 is ${COMMISSION_LEVELS[4].positions}; ${TOTAL_POSITIONS} is the five-level total.`}
      />

      <Surface className="p-0 sm:p-0">
        {members.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No members to inspect.</p>
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => {
              const counts = getLevelCounts(members, bookings, m.userId);
              const directs = getDirects(members, bookings, m.userId);
              const qualified = isQualified(members, bookings, m.userId);
              const open = openId === m.userId;
              return (
                <li key={m.userId} className="px-5 py-4">
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"
                    onClick={() => setOpenId(open ? null : m.userId)}
                    aria-expanded={open}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      Directs {directs.length}/{PERSONAL_SPONSOR_TARGET}
                      <StatusBadge status={qualified ? "qualified" : "not-qualified"} />
                    </span>
                  </button>
                  {open ? (
                    <div className="mt-4 space-y-2 text-sm text-muted">
                      {COMMISSION_LEVELS.map((l) => (
                        <p key={l.level}>
                          L{l.level}: {counts[l.level] ?? 0} / {l.positions}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
    </div>
  );
}
