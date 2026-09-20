import { ApiError } from "@/lib/api-client";

const API_URL = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? "unknown_error", err?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function prelaunchResetPreview() {
  return request<Record<string, any>>("/api/admin/maintenance/prelaunch-reset/preview");
}

export function prelaunchResetExecute(confirmation: string) {
  return request<Record<string, any>>("/api/admin/maintenance/prelaunch-reset/execute", {
    method: "POST",
    body: JSON.stringify({ confirmation }),
  });
}
