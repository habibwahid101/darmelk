import { useEffect, useMemo, useState } from "react";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    done: total <= 0,
  };
}

export function PromotionCountdown({
  endAt,
  serverNow,
  onExpired,
}: {
  endAt: string;
  serverNow?: string;
  onExpired?: () => void;
}) {
  const offset = useMemo(() => {
    if (!serverNow) return 0;
    return new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);
  const end = new Date(endAt).getTime();
  const [now, setNow] = useState(() => Date.now() + offset);
  const remain = parts(end - now);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [offset]);

  useEffect(() => {
    if (remain.done) onExpired?.();
  }, [remain.done, onExpired]);

  const cells = [
    { label: "Days", short: "Days", value: remain.days },
    { label: "Hours", short: "Hours", value: remain.hours },
    { label: "Minutes", short: "Min", value: remain.minutes },
    { label: "Seconds", short: "Sec", value: remain.seconds },
  ];

  if (remain.done) {
    return <p className="text-sm text-muted">This promotion has ended.</p>;
  }

  return (
    <div
      className="grid grid-cols-4 gap-1.5 min-[380px]:gap-3"
      aria-label={`Time remaining ${remain.days} days ${remain.hours} hours ${remain.minutes} minutes ${remain.seconds} seconds`}
    >
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 text-center">
          <p className="font-display text-[1.45rem] font-semibold leading-none tabular-nums text-ink sm:text-[1.85rem]">
            <span className="inline-block min-w-[2ch]">{String(cell.value).padStart(2, "0")}</span>
          </p>
          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-subtle">
            <span className="sm:hidden">{cell.short}</span>
            <span className="hidden sm:inline">{cell.label}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
