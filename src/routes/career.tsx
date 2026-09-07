import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/career")({
  component: CareerLayout,
});

function CareerLayout() {
  return (
    <main>
      <Outlet />
    </main>
  );
}
