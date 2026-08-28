import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="grid min-h-[70svh] place-items-center bg-paper px-6 py-24 text-center text-ink">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-clay/10 text-clay">
          <TriangleAlert className="size-6" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4 font-display text-3xl font-semibold">Something went wrong</h1>
        <p className="mx-auto mt-3 max-w-md text-sm break-words text-muted">
          {error.message || "An unexpected error occurred. Try reloading the page."}
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
