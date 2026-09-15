import { createFileRoute } from "@tanstack/react-router";
import { PolicyDocumentPage } from "@/components/policy-document";

export const Route = createFileRoute("/terms")({
  validateSearch: (s: Record<string, unknown>): { key?: string } => {
    const key = typeof s.key === "string" && s.key.trim() ? s.key.trim() : undefined;
    return key ? { key } : {};
  },
  component: Terms,
});

function Terms() {
  const { key } = Route.useSearch();
  return <PolicyDocumentPage slug={key ?? "general"} />;
}
