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
