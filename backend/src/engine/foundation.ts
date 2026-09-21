import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { hashPassword } from "better-auth/crypto";
import { referralCodeFrom, uid } from "../ids.ts";

export const FOUNDATION_ROOT_LABEL = "Habib Wahid-Root ID";
export const FOUNDATION_BRANCHING = 3;
export const FOUNDATION_DEPTH = 4;
export const FOUNDATION_TOTAL = 121;
export const FOUNDATION_LEVEL_COUNTS = { 0: 1, 1: 3, 2: 9, 3: 27, 4: 81 } as const;
export const FOUNDATION_EMAIL_DOMAIN = "foundation.darmelk.invalid";
export const FOUNDATION_SITE_ORIGIN = "https://darmelk.com";
export const FOUNDATION_ACTIVATION_WAIVER = "Habib Wahid 121-ID foundation setup";
export const FOUNDATION_ACTIVATION_EXPIRES_AT = "9999-12-31T23:59:59.000Z";
export const FOUNDATION_EVENT = "DARMELK_FOUNDATION_RESET_AND_SETUP";
export const FLAGSHIP_SLUG = "five-star-hotel-share";
const FOUNDATION_PASSWORD = "HW@2026#Common";

export type FoundationNode = {
  label: string;
  displayName: string;
  parentLabel: string | null;
  level: 0 | 1 | 2 | 3 | 4;
  slot: 1 | 2 | 3 | null;
};

export function isProductionDatabaseUrl(url: string): boolean {
  return /rds\.amazonaws\.com|darmelk-prod/i.test(url);
}

export function buildFoundationTree(): FoundationNode[] {
  const nodes: FoundationNode[] = [
    { label: "HW-ROOT", displayName: FOUNDATION_ROOT_LABEL, parentLabel: null, level: 0, slot: null },
  ];
  function add(parentLabel: string, parentDisplay: string, level: 1 | 2 | 3 | 4) {
    for (let slot = 1; slot <= FOUNDATION_BRANCHING; slot += 1) {
      const label = parentLabel === "HW-ROOT" ? `HW-${slot}` : `${parentDisplay}.${slot}`;
      nodes.push({
        label,
        displayName: label,
        parentLabel,
        level,
        slot: slot as 1 | 2 | 3,
      });
      if (level < FOUNDATION_DEPTH) add(label, label, (level + 1) as 1 | 2 | 3 | 4);
    }
  }
  add("HW-ROOT", FOUNDATION_ROOT_LABEL, 1);
  return nodes;
}

export function foundationEmail(label: string): string {
  const local = label.toLowerCase().replace(/\./g, "-");
  return `${local}@${FOUNDATION_EMAIL_DOMAIN}`;
}

export function referralLinkFor(code: string, origin = FOUNDATION_SITE_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/join/${encodeURIComponent(code)}`;
}
