import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/properties")({
  component: PropertiesLayout,
});

function PropertiesLayout() {
  return (
    <main>
      <Outlet />
    </main>
  );
}
