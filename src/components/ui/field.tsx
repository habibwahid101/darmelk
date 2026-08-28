import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  error,
  className,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)} htmlFor={htmlFor}>

      <span className="text-xs font-medium text-ink/80">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-xs text-clay">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-subtle">{hint}</span>
      ) : null}
    </label>
  );
}
