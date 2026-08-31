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
        alt="Darmelk"
        width={528}
        height={180}
        className={cn(
          "h-10 w-auto object-contain object-left sm:h-11",
          compact && "h-9 sm:h-10",
        )}
      />
    </span>
  );
}
