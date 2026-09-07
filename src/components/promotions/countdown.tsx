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
    { label: "Days", value: remain.days },
    { label: "Hours", value: remain.hours },
    { label: "Minutes", value: remain.minutes },
    { label: "Seconds", value: remain.seconds },
  ];

  if (remain.done) {
    return <p className="text-sm text-muted">This promotion has ended.</p>;
  }

  return (
    <div className="grid grid-cols-4 gap-2" aria-label="Time remaining">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-xl bg-paper px-2 py-3 text-center">
          <p className="font-display text-xl font-semibold tabular-nums sm:text-2xl">{String(cell.value).padStart(2, "0")}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-subtle">{cell.label}</p>
        </div>
      ))}
    </div>
  );
}
