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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">
            {kicker}
          </p>
        ) : null}
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
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
    <div className="rounded-2xl bg-cream px-6 py-14 text-center shadow-[var(--shadow-card)]">
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
    <div className="rounded-2xl bg-pine px-5 py-4 text-pine-fg shadow-[var(--shadow-card)]">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-pine-fg/80">{description}</p>
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
        tone === "ok" && "bg-pine/10",
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
}: {
  label: string;
  value: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl bg-cream p-5 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </article>
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
