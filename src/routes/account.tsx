import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/account")({
  component: function AccountRedirect() {
    return <Navigate to="/app" />;
  },
});
