import { createFileRoute } from "@tanstack/react-router";
import { PolicyDocumentPage } from "@/components/policy-document";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return <PolicyDocumentPage slug="privacy" />;
}
