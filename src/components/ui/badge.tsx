import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "pine" | "cream";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
        tone === "neutral" && "bg-ink/6 text-ink/80",
        tone === "pine" && "bg-pine text-pine-fg",
        tone === "cream" && "bg-cream/90 text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}
