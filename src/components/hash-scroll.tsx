import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

export function HashScroll() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const id = hash.replace(/^#/, "");
    if (!id || pathname !== "/") return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [hash, pathname]);

  return null;
}
