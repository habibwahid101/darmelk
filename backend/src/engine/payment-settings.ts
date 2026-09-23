import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../errors.js";
import { uid } from "../ids.js";
import { logAdminAction } from "./members.js";

export const PAYMENT_CONTEXTS = ["growth_activation", "growth_booking"] as const;
export type PaymentContext = (typeof PAYMENT_CONTEXTS)[number];
export const PAYMENT_RAILS = ["bank", "mfs", "merchant"] as const;
export type PaymentRail = (typeof PAYMENT_RAILS)[number];
export const RECEIVING_METHODS = ["bank", "mfs"] as const;
export type ReceivingMethod = (typeof RECEIVING_METHODS)[number];

export const METHOD_UNAVAILABLE = "This payment method is currently unavailable for this transaction.";
export const ACCOUNT_UNAVAILABLE = "This receiving account is currently unavailable for this transaction.";

export type PaymentTarget = "activation" | "booking" | "merchant_bundle";

export type ReceivingAccount = {
  id: string;
  method: ReceivingMethod;
  provider: string;
  label: string;
  account_number: string;
  account_holder_name: string;
  account_type: string;
  bank_name: string;
  branch: string;
  routing_number: string;
  instructions: string;
  enabled: boolean;
  display_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  contexts: PaymentContext[];
};

export type PaymentMethodSetting = {
  context: PaymentContext;
  method: PaymentRail;
  enabled: boolean;
  updated_at: string;
};

export type PublicReceivingAccount = {
  id: string;
  method: ReceivingMethod;
  provider: string;
  label: string;
  account_number: string;
  account_holder_name: string;
  account_type: string;
  bank_name: string;
  branch: string;
  routing_number: string;
  instructions: string;
  display_order: number;
};

export type EffectiveMethod = {
  method: PaymentRail;
  enabled: boolean;
  available: boolean;
  accounts: PublicReceivingAccount[];
};

export type EffectivePaymentOptions = {
  context: PaymentContext | "merchant_bundle";
  methods: EffectiveMethod[];
};

const TARGET_CONTEXT: Record<Exclude<PaymentTarget, "merchant_bundle">, PaymentContext> = {
  activation: "growth_activation",
  booking: "growth_booking",
};

export function contextFromTarget(target?: string | null): PaymentContext | "merchant_bundle" | null {
  const value = String(target ?? "").trim().toLowerCase();
  if (value === "activation" || value === "growth_activation") return "growth_activation";
  if (value === "booking" || value === "growth_booking") return "growth_booking";
  if (value === "merchant_bundle") return "merchant_bundle";
  return null;
}

function cleanText(value: unknown, field: string, max: number, required = true): string {
  if (typeof value !== "string") {
    if (required) throw badRequest(`${field} is required`);
    return "";
  }
  const result = value.trim();
  if (required && !result) throw badRequest(`${field} is required`);
  if (result.length > max) throw badRequest(`${field} is too long`);
  return result;
}

function parseProvider(method: ReceivingMethod, raw: unknown): string {
  if (method === "bank") {
    const value = typeof raw === "string" ? raw.trim().toLowerCase() : "bank";
    return value || "bank";
  }
  const provider = cleanText(raw, "Provider", 32).toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!provider) throw badRequest("MFS provider is required");
  return provider;
}

function parseContexts(raw: unknown): PaymentContext[] {
  const list = Array.isArray(raw) ? raw : [];
  const contexts = [...new Set(list.map((item) => String(item)))] as PaymentContext[];
  for (const context of contexts) {
    if (!PAYMENT_CONTEXTS.includes(context)) throw badRequest("Invalid payment context");
  }
  if (!contexts.length) throw badRequest("Select Activation, Booking, or both");
  return contexts;
}

function publicAccount(row: ReceivingAccount): PublicReceivingAccount {
  return {
    id: row.id,
    method: row.method,
    provider: row.provider,
    label: row.label,
    account_number: row.account_number,
    account_holder_name: row.account_holder_name,
    account_type: row.account_type,
    bank_name: row.bank_name,
    branch: row.branch,
    routing_number: row.routing_number,
    instructions: row.instructions,
    display_order: row.display_order,
  };
}

export function snapshotReceivingAccount(
  account: ReceivingAccount | PublicReceivingAccount,
  context: PaymentContext | "merchant_bundle",
): Record<string, unknown> {
  const paymentMethod = account.method === "bank" ? "bank" : account.provider;
  return {
    receiving_account_id: account.id,
    method: account.method,
    provider: account.provider,
    payment_method: paymentMethod,
    label: account.label,
    account_number: account.account_number,
    account: account.account_number,
    account_holder_name: account.account_holder_name,
    accountName: account.account_holder_name,
    account_type: account.account_type,
    accountType: account.account_type,
    bank_name: account.bank_name,
    bankName: account.bank_name || undefined,
    branch: account.branch || undefined,
    routing_number: account.routing_number,
    routingNumber: account.routing_number || null,
    instructions: account.instructions,
    context,
  };
}

export function submissionPaymentMethod(account: { method: ReceivingMethod; provider: string }): string {
  return account.method === "bank" ? "bank" : account.provider;
}

async function loadAccount(client: PoolClient, id: string): Promise<ReceivingAccount> {
  const { rows } = await client.query<Omit<ReceivingAccount, "contexts">>(
    `select * from receiving_accounts where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound("Receiving account not found");
  const contexts = await client.query<{ context: PaymentContext }>(
    `select context from receiving_account_contexts where account_id = $1 order by context`,
    [id],
  );
  return { ...row, contexts: contexts.rows.map((item) => item.context) };
}

async function listAccounts(client: PoolClient, includeArchived = false): Promise<ReceivingAccount[]> {
  const { rows } = await client.query<Omit<ReceivingAccount, "contexts">>(
    includeArchived
      ? `select * from receiving_accounts order by method, display_order, created_at`
      : `select * from receiving_accounts where archived_at is null order by method, display_order, created_at`,
  );
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const ctx = await client.query<{ account_id: string; context: PaymentContext }>(
    `select account_id, context from receiving_account_contexts where account_id = any($1::text[])`,
    [ids],
  );
  const byId = new Map<string, PaymentContext[]>();
  for (const row of ctx.rows) {
    const list = byId.get(row.account_id) ?? [];
    list.push(row.context);
    byId.set(row.account_id, list);
  }
  return rows.map((row) => ({ ...row, contexts: byId.get(row.id) ?? [] }));
}

export async function listPaymentMethodSettings(client: PoolClient): Promise<PaymentMethodSetting[]> {
  const { rows } = await client.query<PaymentMethodSetting>(
    `select context, method, enabled, updated_at from payment_method_settings order by context, method`,
  );
  return rows;
}

async function eligibleAccounts(
  client: PoolClient,
  context: PaymentContext | "merchant_bundle",
  method: ReceivingMethod,
): Promise<ReceivingAccount[]> {
  const accounts = await listAccounts(client, false);
  return accounts.filter((account) => {
    if (account.method !== method || !account.enabled || account.archived_at) return false;
    if (context === "merchant_bundle") return true;
    return account.contexts.includes(context);
  });
}

export async function getEffectivePaymentOptions(
  client: PoolClient,
  target?: string | null,
): Promise<EffectivePaymentOptions> {
  const mapped = contextFromTarget(target) ?? (target ? null : "growth_activation");
  if (!mapped) throw badRequest("Unknown payment context");
  const methods: EffectiveMethod[] = [];
  if (mapped === "merchant_bundle") {
    for (const method of RECEIVING_METHODS) {
      const accounts = (await eligibleAccounts(client, mapped, method)).map(publicAccount);
      methods.push({ method, enabled: true, available: accounts.length > 0, accounts });
    }
    methods.push({ method: "merchant", enabled: false, available: false, accounts: [] });
    return { context: mapped, methods };
  }
  const settings = await listPaymentMethodSettings(client);
  for (const rail of PAYMENT_RAILS) {
    const setting = settings.find((row) => row.context === mapped && row.method === rail);
    const enabled = Boolean(setting?.enabled);
    if (rail === "merchant") {
      methods.push({ method: rail, enabled, available: enabled, accounts: [] });
      continue;
    }
    const accounts = enabled ? (await eligibleAccounts(client, mapped, rail)).map(publicAccount) : [];
    methods.push({ method: rail, enabled, available: enabled && accounts.length > 0, accounts });
  }
  return { context: mapped, methods };
}

export async function listLegacyDestinations(client: PoolClient, target?: string | null) {
  const options = await getEffectivePaymentOptions(client, target ?? "activation");
  const destinations = [];
  for (const method of options.methods) {
    if (method.method === "merchant") continue;
    for (const account of method.accounts) {
      destinations.push({
        id: account.id,
        method: submissionPaymentMethod(account),
        rail: account.method,
        provider: account.provider,
        label: account.label,
        account: account.account_number,
        accountType: account.account_type || undefined,
        bankName: account.bank_name || undefined,
        accountName: account.account_holder_name || undefined,
        branch: account.branch || undefined,
        routingNumber: account.routing_number || null,
        instructions: account.instructions || undefined,
      });
    }
  }
  return destinations;
}

export async function assertRailAvailable(
  client: PoolClient,
  target: PaymentTarget,
  rail: PaymentRail,
): Promise<PaymentContext | "merchant_bundle"> {
  const mapped = contextFromTarget(target);
  if (!mapped) throw badRequest("Unsupported payment target");
  if (mapped === "merchant_bundle") {
    if (rail === "merchant") throw badRequest(METHOD_UNAVAILABLE, "payment_method_not_allowed");
    const accounts = await eligibleAccounts(client, mapped, rail);
    if (!accounts.length) throw badRequest(METHOD_UNAVAILABLE, "payment_method_not_allowed");
    return mapped;
  }
  const { rows } = await client.query<{ enabled: boolean }>(
    `select enabled from payment_method_settings where context = $1 and method = $2`,
    [mapped, rail],
  );
  if (!rows[0]?.enabled) throw badRequest(METHOD_UNAVAILABLE, "payment_method_not_allowed");
  if (rail !== "merchant") {
    const accounts = await eligibleAccounts(client, mapped, rail);
    if (!accounts.length) throw badRequest(METHOD_UNAVAILABLE, "payment_method_not_allowed");
  }
  return mapped;
}

export async function resolveReceivingAccount(
  client: PoolClient,
  input: {
    targetType: PaymentTarget;
    receivingAccountId?: unknown;
    paymentMethod?: unknown;
  },
): Promise<{ account: ReceivingAccount; context: PaymentContext | "merchant_bundle"; snapshot: Record<string, unknown> }> {
  const context = contextFromTarget(input.targetType);
  if (!context) throw badRequest("Unsupported payment target");
  const requestedId = typeof input.receivingAccountId === "string" ? input.receivingAccountId.trim() : "";
  const requestedMethod = typeof input.paymentMethod === "string" ? input.paymentMethod.trim().toLowerCase() : "";
  if (
    requestedMethod &&
    requestedMethod !== "bank" &&
    requestedMethod !== "mfs" &&
    requestedMethod !== "merchant"
  ) {
    const known = await client.query(
      `select 1 from receiving_accounts where provider = $1 limit 1`,
      [requestedMethod],
    );
    if (!known.rows[0]) throw badRequest("Unsupported payment method", "unsupported_payment_method");
  }

  if (requestedId) {
    const account = await loadAccount(client, requestedId);
    if (account.archived_at || !account.enabled) throw badRequest(ACCOUNT_UNAVAILABLE, "receiving_account_unavailable");
    if (context !== "merchant_bundle" && !account.contexts.includes(context)) {
      throw badRequest(ACCOUNT_UNAVAILABLE, "receiving_account_unavailable");
    }
    await assertRailAvailable(client, input.targetType, account.method);
    if (requestedMethod) {
      const expected = submissionPaymentMethod(account);
      if (requestedMethod !== expected && requestedMethod !== account.method) {
        throw badRequest(ACCOUNT_UNAVAILABLE, "receiving_account_unavailable");
      }
    }
    return { account, context, snapshot: snapshotReceivingAccount(account, context) };
  }

  if (!requestedMethod || requestedMethod === "merchant") {
    throw badRequest("Select a receiving account", "receiving_account_required");
  }
  const methodRail: ReceivingMethod = requestedMethod === "bank" ? "bank" : "mfs";
  await assertRailAvailable(client, input.targetType, methodRail);
  const matches = (await eligibleAccounts(client, context, methodRail)).filter((account) => {
    if (methodRail === "bank") return true;
    return account.provider === requestedMethod;
  });
  if (matches.length === 1) {
    return { account: matches[0]!, context, snapshot: snapshotReceivingAccount(matches[0]!, context) };
  }
  if (!matches.length) throw badRequest(METHOD_UNAVAILABLE, "payment_method_not_allowed");
  throw badRequest("Select a receiving account", "receiving_account_required");
}

export async function setPaymentMethodEnabled(
  client: PoolClient,
  adminId: string,
  input: { context?: unknown; method?: unknown; enabled?: unknown },
): Promise<PaymentMethodSetting> {
  const context = String(input.context ?? "") as PaymentContext;
  const method = String(input.method ?? "") as PaymentRail;
  if (!PAYMENT_CONTEXTS.includes(context) || !PAYMENT_RAILS.includes(method)) {
    throw badRequest("Invalid payment method setting");
  }
  const enabled = Boolean(input.enabled);
  if (enabled && method !== "merchant") {
    const accounts = await eligibleAccounts(client, context, method);
    if (!accounts.length) {
      throw badRequest(
        `Add at least one enabled ${method === "bank" ? "Bank" : "MFS"} receiving account for this context before turning it on.`,
        "receiving_account_required",
      );
    }
  }
  const before = await client.query<PaymentMethodSetting>(
    `select context, method, enabled, updated_at from payment_method_settings where context = $1 and method = $2`,
    [context, method],
  );
  const { rows } = await client.query<PaymentMethodSetting>(
    `update payment_method_settings set enabled = $3, updated_at = now()
      where context = $1 and method = $2
      returning context, method, enabled, updated_at`,
    [context, method, enabled],
  );
  const row = rows[0];
  if (!row) throw notFound("Payment method setting not found");
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: enabled ? "payment_method.enabled" : "payment_method.disabled",
    targetType: "payment_method_setting",
    targetId: `${context}:${method}`,
    payload: { context, method, previous: before.rows[0]?.enabled ?? null, enabled },
  });
  return row;
}

async function replaceContexts(client: PoolClient, accountId: string, contexts: PaymentContext[]) {
  await client.query(`delete from receiving_account_contexts where account_id = $1`, [accountId]);
  for (const context of contexts) {
    await client.query(`insert into receiving_account_contexts (account_id, context) values ($1,$2)`, [accountId, context]);
  }
}

function accountPayload(input: Record<string, unknown>) {
  const method = String(input.method ?? "") as ReceivingMethod;
  if (!RECEIVING_METHODS.includes(method)) throw badRequest("Method must be Bank or MFS");
  return {
    method,
    provider: parseProvider(method, input.provider),
    label: cleanText(input.label, "Label", 80),
    account_number: cleanText(input.accountNumber ?? input.account_number, "Account number", 80),
    account_holder_name: cleanText(input.accountHolderName ?? input.account_holder_name, "Account holder", 80, false),
    account_type: cleanText(input.accountType ?? input.account_type, "Account type", 40, false),
    bank_name: method === "bank" ? cleanText(input.bankName ?? input.bank_name, "Bank name", 80) : "",
    branch: cleanText(input.branch, "Branch", 80, false),
    routing_number: cleanText(input.routingNumber ?? input.routing_number, "Routing number", 40, false),
    instructions: cleanText(input.instructions, "Instructions", 1000, false),
    enabled: input.enabled !== false,
    display_order: Number.isFinite(Number(input.displayOrder ?? input.display_order))
      ? Math.trunc(Number(input.displayOrder ?? input.display_order))
      : 0,
    contexts: parseContexts(input.contexts),
  };
}

export async function listAdminReceivingAccounts(client: PoolClient): Promise<ReceivingAccount[]> {
  return listAccounts(client, true);
}

export async function createReceivingAccount(
  client: PoolClient,
  adminId: string,
  input: Record<string, unknown>,
): Promise<ReceivingAccount> {
  const data = accountPayload(input);
  const id = uid("rcv");
  await client.query(
    `insert into receiving_accounts (
        id, method, provider, label, account_number, account_holder_name, account_type,
        bank_name, branch, routing_number, instructions, enabled, display_order, created_by_admin_id
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      data.method,
      data.provider,
      data.label,
      data.account_number,
      data.account_holder_name,
      data.account_type,
      data.bank_name,
      data.branch,
      data.routing_number,
      data.instructions,
      data.enabled,
      data.display_order,
      adminId,
    ],
  );
  await replaceContexts(client, id, data.contexts);
  const created = await loadAccount(client, id);
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: "receiving_account.created",
    targetType: "receiving_account",
    targetId: id,
    payload: { method: created.method, provider: created.provider, label: created.label, contexts: created.contexts },
  });
  return created;
}

export async function updateReceivingAccount(
  client: PoolClient,
  adminId: string,
  accountId: string,
  input: Record<string, unknown>,
): Promise<ReceivingAccount> {
  const before = await loadAccount(client, accountId);
  if (before.archived_at) throw conflict("Archived receiving accounts cannot be edited");
  const data = accountPayload({ ...before, ...input, contexts: input.contexts ?? before.contexts });
  await client.query(
    `update receiving_accounts set
        provider = $2, label = $3, account_number = $4, account_holder_name = $5, account_type = $6,
        bank_name = $7, branch = $8, routing_number = $9, instructions = $10, enabled = $11,
        display_order = $12, updated_at = now()
      where id = $1`,
    [
      accountId,
      data.provider,
      data.label,
      data.account_number,
      data.account_holder_name,
      data.account_type,
      data.bank_name,
      data.branch,
      data.routing_number,
      data.instructions,
      data.enabled,
      data.display_order,
    ],
  );
  const previousContexts = before.contexts.slice().sort().join(",");
  const nextContexts = data.contexts.slice().sort().join(",");
  await replaceContexts(client, accountId, data.contexts);
  const updated = await loadAccount(client, accountId);
  const actionType =
    before.enabled !== updated.enabled
      ? updated.enabled
        ? "receiving_account.enabled"
        : "receiving_account.disabled"
      : previousContexts !== nextContexts
        ? "receiving_account.context_changed"
        : before.display_order !== updated.display_order
          ? "receiving_account.order_changed"
          : "receiving_account.updated";
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType,
    targetType: "receiving_account",
    targetId: accountId,
    payload: {
      previous: {
        label: before.label,
        account_number: before.account_number,
        enabled: before.enabled,
        contexts: before.contexts,
        display_order: before.display_order,
      },
      next: {
        label: updated.label,
        account_number: updated.account_number,
        enabled: updated.enabled,
        contexts: updated.contexts,
        display_order: updated.display_order,
      },
    },
  });
  return updated;
}

export async function archiveReceivingAccount(
  client: PoolClient,
  adminId: string,
  accountId: string,
): Promise<ReceivingAccount> {
  const before = await loadAccount(client, accountId);
  if (before.archived_at) return before;
  await client.query(
    `update receiving_accounts set enabled = false, archived_at = now(), updated_at = now() where id = $1`,
    [accountId],
  );
  const updated = await loadAccount(client, accountId);
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: "receiving_account.archived",
    targetType: "receiving_account",
    targetId: accountId,
    payload: { previousEnabled: before.enabled },
  });
  return updated;
}

export async function deleteUnusedReceivingAccount(
  client: PoolClient,
  adminId: string,
  accountId: string,
): Promise<void> {
  const used = await client.query(
    `select 1 from payment_submissions where receiving_account_id = $1 limit 1`,
    [accountId],
  );
  if (used.rows[0]) {
    throw conflict("This receiving account has payment history. Archive it instead of deleting.");
  }
  const before = await loadAccount(client, accountId);
  await client.query(`delete from receiving_accounts where id = $1`, [accountId]);
  await logAdminAction(client, {
    adminUserId: adminId,
    actionType: "receiving_account.deleted",
    targetType: "receiving_account",
    targetId: accountId,
    payload: { label: before.label, method: before.method },
  });
}
