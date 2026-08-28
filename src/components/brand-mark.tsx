import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 32 32"
        className="size-8 shrink-0"
        aria-hidden="true"
      >
        <rect
          width="32"
          height="32"
          rx="7"
          className={inverted ? "fill-cream" : "fill-pine"}
        />
        <path
          d="M8.5 23.5V13.2L16 7.8l7.5 5.4v10.3h-5.2v-6.1h-4.6v6.1H8.5z"
          className={inverted ? "fill-pine" : "fill-cream"}
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display text-[15px] font-semibold tracking-tight",
            inverted ? "text-cream" : "text-ink",
          )}
        >
          Property Gateway
        </span>
        <span
          className={cn(
            "mt-0.5 text-[10px] font-medium tracking-[0.16em] uppercase",
            inverted ? "text-cream/70" : "text-muted",
          )}
        >
          Property first
        </span>
      </span>
    </span>
  );
}
