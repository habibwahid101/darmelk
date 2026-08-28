import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div>
      {kicker ? (
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">
          {kicker}
        </p>
      ) : null}
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="min-w-0 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h1>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
      {description ? (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-cream px-6 py-10 text-center shadow-[var(--shadow-card)]">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-mist text-pine">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <p className="mt-4 font-display text-2xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-cream px-6 py-10 text-center shadow-[var(--shadow-card)]">
      <p className="font-display text-2xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function SuccessBanner({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-ok px-5 py-4 text-ok-fg shadow-[var(--shadow-card)]">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-ok-fg/80">{description}</p>
    </div>
  );
}

export function AlertBanner({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "danger";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-5 py-4 shadow-[var(--shadow-card)]",
        tone === "neutral" && "bg-cream",
        tone === "ok" && "bg-ok/10",
        tone === "warn" && "bg-gold/10",
        tone === "danger" && "bg-clay/10",
      )}
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-ink/8", className)} />;
}

export function StatCard({
  label,
  value,
  hint,
  action,
  compact = false,
}: {
  label: string;
  value: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p
        className={cn(
          "mt-3 font-display font-semibold tracking-tight tabular-nums whitespace-nowrap",
          compact ? "text-xl" : "text-2xl",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </article>
  );
}

export function AmountRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number;
  compact?: boolean;
}) {
  const figure = value.toLocaleString("en-US");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_8.5ch] items-baseline gap-x-3 border-b border-line py-2.5 last:border-0 last:pb-0 first:pt-0">
      <dt className="min-w-0 text-sm text-muted">{label}</dt>
      <span aria-hidden="true" className="text-sm font-medium text-muted">
        BDT
      </span>
      <dd
        className={cn(
          "text-right font-display font-semibold tabular-nums whitespace-nowrap",
          compact ? "text-base" : "text-lg sm:text-xl",
        )}
      >
        <span className="sr-only">BDT </span>
        {figure}
      </dd>
    </div>
  );
}

export function Surface({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6", className)}>
      {children}
    </div>
  );
}