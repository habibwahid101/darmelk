import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/landing-page";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main>
      <LandingPage />
    </main>
  );
}
