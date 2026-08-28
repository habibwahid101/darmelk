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
        src={inverted ? "/brand/darmelk-lockup-light.png" : "/brand/darmelk-lockup.png"}
        alt="Darmelk — Your Property Gateway"
        width={436}
        height={160}
        className={cn(
          "h-9 w-auto object-contain object-left sm:h-10",
          compact && "h-8 sm:h-9",
        )}
      />
    </span>
  );
}
