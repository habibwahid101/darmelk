import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/join/$code")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/login",
      search: { mode: "create", ref: String(params.code ?? "").trim().toUpperCase() },
    });
  },
});
