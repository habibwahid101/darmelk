import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  inverted = false,
  compact = false,
}: {
  className?: string;
  inverted?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src="/brand/darmelk-lockup.png"
        alt="Darmelk — Your Property Gateway"
        width={203}
        height={80}
        className={cn(
          "h-9 w-auto rounded-md object-contain object-left sm:h-10",
          compact && "h-8 sm:h-9",
          inverted && "ring-1 ring-cream/20",
        )}
      />
    </span>
  );
}
