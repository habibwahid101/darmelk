import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemberSession } from "@/components/layout/use-member";

export const Route = createFileRoute("/app/onboarding")({
  component: OnboardingRedirect,
});

/** Registration now binds sponsor + member record. Existing bookmarks go to the dashboard. */
function OnboardingRedirect() {
  const { member } = useMemberSession();
  if (!member) return null;
  return <Navigate to="/app" />;
}
