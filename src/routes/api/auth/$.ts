import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

function gone() {
  return new Response("Auth is served by the Darmelk API", { status: 404 });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => (API_URL ? gone() : auth.handler(request)),
      POST: ({ request }) => (API_URL ? gone() : auth.handler(request)),
    },
  },
});
