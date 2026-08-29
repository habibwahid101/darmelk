import { randomUUID, randomBytes } from "node:crypto";

export function uid(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function referralCodeFrom(userId: string): string {
  const stem = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  const salt = randomBytes(2).toString("hex").toUpperCase();
  return `DM-${stem || "MEMBER"}${salt}`;
}
