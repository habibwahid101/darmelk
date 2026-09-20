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
export const FOUNDATION_EVENT = "DARMELK_FOUNDATION_RESET_AND_SETUP";
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

export function assertTreeShape(nodes: FoundationNode[]): void {
  if (nodes.length !== FOUNDATION_TOTAL) throw new Error(`expected ${FOUNDATION_TOTAL} nodes, got ${nodes.length}`);
  const byLevel = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const byLabel = new Map(nodes.map((n) => [n.label, n]));
  for (const n of nodes) byLevel[n.level] += 1;
  for (const level of [0, 1, 2, 3, 4] as const) {
    if (byLevel[level] !== FOUNDATION_LEVEL_COUNTS[level]) {
      throw new Error(`level ${level} expected ${FOUNDATION_LEVEL_COUNTS[level]}, got ${byLevel[level]}`);
    }
  }
  const children = new Map<string, FoundationNode[]>();
  for (const n of nodes) {
    if (!n.parentLabel) continue;
    const list = children.get(n.parentLabel) ?? [];
    list.push(n);
    children.set(n.parentLabel, list);
  }
  for (const n of nodes) {
    const kids = children.get(n.label) ?? [];
    if (n.level < FOUNDATION_DEPTH && kids.length !== FOUNDATION_BRANCHING) {
      throw new Error(`${n.label} expected ${FOUNDATION_BRANCHING} children, got ${kids.length}`);
    }
    if (n.level === FOUNDATION_DEPTH && kids.length !== 0) {
      throw new Error(`${n.label} is level 4 and must have no children`);
    }
    if (n.parentLabel) {
      const parent = byLabel.get(n.parentLabel);
      if (!parent) throw new Error(`${n.label} missing parent ${n.parentLabel}`);
      if (parent.level !== n.level - 1) throw new Error(`${n.label} parent level mismatch`);
    }
  }
}

type PgLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

async function runSql(client: PgLike, sql: string, params: unknown[] = []): Promise<void> {
  try {
    await client.query(sql, params);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
    if (code === "42P01" || code === "42703") return;
    throw err;
  }
}

async function countSql(client: PgLike, sql: string, params: unknown[] = []): Promise<number> {
  try {
    const { rows } = await client.query(sql, params);
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
    if (code === "42P01" || code === "42703") return 0;
    throw err;
  }
}

export async function inspectResetScope(client: PoolClient): Promise<{
  admins: Array<{ user_id: string; email: string; role: string }>;
  nonAdminCount: number;
  foundationExisting: number;
  orphanAuthUsers: number;
  dependentRecords: Record<string, number>;
}> {
  const admins = await client.query<{ user_id: string; email: string; role: string }>(
    `select m.user_id, u.email, m.role
       from members m
       join "user" u on u.id = m.user_id
      where m.role = 'admin'
      order by u.email`,
  );
  const nonAdmin = await client.query<{ count: string }>(
    `select count(*)::text as count from members where role <> 'admin'`,
  );
  const foundation = await client.query<{ count: string }>(
    `select count(*)::text as count from "user"
      where name = $1 or name ~ '^HW-[0-9]'`,
    [FOUNDATION_ROOT_LABEL],
  );
  const orphans = await countSql(
    client,
    `select count(*)::text as count from "user" u
      where not exists (select 1 from members m where m.user_id = u.id)`,
  );
  const idsRes = await client.query<{ user_id: string }>(`select user_id from members where role <> 'admin'`);
  const ids = idsRes.rows.map((r) => r.user_id);
  const dependentRecords: Record<string, number> = {};
  if (ids.length > 0) {
    const counts: Array<[string, string]> = [
      ["bookings", `select count(*)::text as count from bookings where user_id = any($1::text[])`],
      ["commission_ledger", `select count(*)::text as count from commission_ledger where beneficiary_user_id = any($1::text[]) or source_user_id = any($1::text[])`],
      ["annual_activations", `select count(*)::text as count from annual_activations where user_id = any($1::text[])`],
      ["withdrawals", `select count(*)::text as count from withdrawals where user_id = any($1::text[])`],
      ["payment_submissions", `select count(*)::text as count from payment_submissions where user_id = any($1::text[])`],
      ["user_consents", `select count(*)::text as count from user_consents where user_id = any($1::text[])`],
      ["sessions", `select count(*)::text as count from "session" where "userId" = any($1::text[])`],
    ];
    for (const [name, sql] of counts) {
      dependentRecords[name] = await countSql(client, sql, [ids]);
    }
  }
  return {
    admins: admins.rows,
    nonAdminCount: Number(nonAdmin.rows[0]?.count ?? 0),
    foundationExisting: Number(foundation.rows[0]?.count ?? 0),
    orphanAuthUsers: orphans,
    dependentRecords,
  };
}

export async function deleteNonAdminMembers(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ user_id: string }>(`select user_id from members where role <> 'admin'`);
  const ids = rows.map((r) => r.user_id);
  const adminCount = await countSql(client, `select count(*)::text as count from members where role = 'admin'`);
  if (adminCount === 0) throw new Error("No admin members found. Refusing to delete non-admin users.");

  if (ids.length > 0) {
    await client.query(
      `update members
          set sponsor_user_id = case when sponsor_user_id = any($1::text[]) then null else sponsor_user_id end,
              network_parent_user_id = case when network_parent_user_id = any($1::text[]) then null else network_parent_user_id end,
              network_slot = case when network_parent_user_id = any($1::text[]) then null else network_slot end
        where sponsor_user_id = any($1::text[])
           or network_parent_user_id = any($1::text[])
           or role <> 'admin'`,
      [ids],
    );
  }

  const nullFks: Array<[string, string]> = [
    ["bookings", "confirmed_by_admin_id"],
    ["bookings", "cancelled_by_admin_id"],
    ["annual_activations", "decided_by_admin_id"],
    ["withdrawals", "decided_by_admin_id"],
    ["withdrawals", "paid_by_admin_id"],
    ["reversal_entries", "reversed_by_admin_id"],
    ["payment_submissions", "reviewed_by_admin_id"],
    ["contact_requests", "reviewed_by_admin_id"],
    ["leadership_reward_entitlements", "reversed_by_admin_id"],
    ["merchant_bundle_purchases", "confirmed_by_admin_id"],
    ["merchant_gift_fulfillments", "updated_by_admin_id"],
    ["promotions", "created_by_admin_id"],
    ["promotions", "published_by_admin_id"],
    ["promotions", "closed_by_admin_id"],
    ["promotion_reward_fulfillments", "updated_by_admin_id"],
    ["promotion_reward_events", "actor_user_id"],
    ["merchant_credit_ledger", "actor_user_id"],
  ];
  if (ids.length > 0) {
    for (const [table, column] of nullFks) {
      await runSql(client, `update ${table} set ${column} = null where ${column} = any($1::text[])`, [ids]);
    }
  }

  const run = (sql: string) => runSql(client, sql, [ids]);

  if (ids.length > 0) {
    await run(
      `delete from offer_inventory_events where booking_id in (select id from bookings where user_id = any($1::text[]))`,
    );
    await run(
      `delete from commission_payout_allocations where withdrawal_id in (select id from withdrawals where user_id = any($1::text[]))`,
    );
    await run(
      `delete from reversal_entries where commission_ledger_id in (select id from commission_ledger where beneficiary_user_id = any($1::text[]) or source_user_id = any($1::text[]))`,
    );
    await run(`delete from reversal_entries where reversed_by_admin_id = any($1::text[])`);
    await run(
      `delete from commission_ledger where beneficiary_user_id = any($1::text[]) or source_user_id = any($1::text[])`,
    );
    await run(`delete from booking_snapshots where user_id = any($1::text[])`);
    await run(`delete from bookings where user_id = any($1::text[])`);
    await run(`delete from withdrawals where user_id = any($1::text[])`);
    await run(`delete from annual_activations where user_id = any($1::text[])`);
    await run(`delete from user_consents where user_id = any($1::text[])`);
    await run(`delete from payment_submissions where user_id = any($1::text[])`);
    await run(`delete from payout_methods where user_id = any($1::text[])`);
    await run(`delete from leadership_reward_entitlements where user_id = any($1::text[])`);
    await run(`delete from leadership_reward_tier_events where user_id = any($1::text[])`);
    await run(`delete from leadership_reward_cycles where user_id = any($1::text[])`);
    await run(`delete from merchant_gift_fulfillments where merchant_user_id = any($1::text[])`);
    await run(`delete from merchant_credit_ledger where merchant_user_id = any($1::text[])`);
    await run(
      `delete from merchant_payment_requests where customer_user_id = any($1::text[]) or merchant_user_id = any($1::text[])`,
    );
    await run(`delete from merchant_bundle_purchases where user_id = any($1::text[])`);
    await run(`delete from merchants where user_id = any($1::text[])`);
    await run(
      `delete from promotion_reward_events
        where actor_user_id = any($1::text[])
           or qualification_id in (select id from promotion_qualifications where user_id = any($1::text[]))
           or fulfillment_id in (select id from promotion_reward_fulfillments where user_id = any($1::text[]))`,
    );
    await run(`delete from promotion_reward_fulfillments where user_id = any($1::text[])`);
    await run(`delete from promotion_qualifications where user_id = any($1::text[])`);
    await run(`delete from idempotency_keys where user_id = any($1::text[])`);
    await run(`delete from admin_actions where admin_user_id = any($1::text[])`);
    await run(`delete from "verification" where identifier in (select email from "user" where id = any($1::text[]))`);
    await client.query(`delete from members where user_id = any($1::text[])`, [ids]);
  }

  await client.query(
    `delete from "session" where "userId" not in (select user_id from members where role = 'admin')`,
  );
  await client.query(
    `delete from "account" where "userId" not in (select user_id from members where role = 'admin')`,
  );
  await client.query(`delete from "user" where id not in (select user_id from members where role = 'admin')`);
  return ids.length;
}

export async function createFoundationNetwork(
  client: PoolClient,
  opts: { actorUserId: string | null; runId: string },
): Promise<{
  created: number;
  wallets: number;
  referralCodes: string[];
  byLevel: Record<0 | 1 | 2 | 3 | 4, number>;
}> {
  const nodes = buildFoundationTree();
  assertTreeShape(nodes);
  const idByLabel = new Map<string, string>();
  const codes: string[] = [];
  const byLevel: Record<0 | 1 | 2 | 3 | 4, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const expires = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
  const passwordHash = await hashPassword(FOUNDATION_PASSWORD);

  for (const node of nodes) {
    const userId = randomUUID();
    const email = foundationEmail(node.label);
    const code = referralCodeFrom(userId);
    await client.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, true, now(), now())`,
      [userId, node.displayName, email],
    );
    await client.query(
      `insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1, $2, 'credential', $3, $4, now(), now())`,
      [uid("acc"), userId, userId, passwordHash],
    );
    const parentId = node.parentLabel ? (idByLabel.get(node.parentLabel) ?? null) : null;
    await client.query(
      `insert into members (
          user_id, referral_code, phone, role, sponsor_user_id,
          network_parent_user_id, network_slot, onboarding_complete,
          activation_status, activation_expires_at
        ) values ($1,$2,'', 'member', $3, $4, $5, true, 'active', $6)`,
      [userId, code, parentId, parentId, node.slot, expires.toISOString()],
    );
    idByLabel.set(node.label, userId);
    codes.push(code);
    byLevel[node.level] += 1;
  }

  if (opts.actorUserId) {
    await client.query(
      `insert into admin_actions (id, admin_user_id, action_type, target_type, target_id, payload)
       values ($1,$2,$3,'system',$4,$5)`,
      [
        uid("aa"),
        opts.actorUserId,
        FOUNDATION_EVENT,
        opts.runId,
        JSON.stringify({
          runId: opts.runId,
          root: byLevel[0],
          l1: byLevel[1],
          l2: byLevel[2],
          l3: byLevel[3],
          l4: byLevel[4],
          total: nodes.length,
          wallets: nodes.length,
          referralCodes: codes.length,
          activationExemption: FOUNDATION_ACTIVATION_WAIVER,
          activationFee: 0,
          walletModel: "commission_ledger by beneficiary_user_id",
        }),
      ],
    );
  }

  return { created: nodes.length, wallets: nodes.length, referralCodes: codes, byLevel };
}

export async function validateFoundation(client: PoolClient): Promise<{
  ok: boolean;
  errors: string[];
  byLevel: Record<0 | 1 | 2 | 3 | 4, number>;
  active: number;
  commissionEligible: number;
  codes: number;
  credentials: number;
  wallets: number;
  sampleAncestry: string[];
  sampleReferral: { name: string; code: string; link: string } | null;
}> {
  const errors: string[] = [];
  const { rows } = await client.query<{
    user_id: string;
    name: string;
    referral_code: string;
    sponsor_user_id: string | null;
    network_parent_user_id: string | null;
    network_slot: number | null;
    activation_status: string;
    activation_expires_at: string | null;
    has_password: boolean;
    level: string;
  }>(
    `select m.user_id, u.name, m.referral_code, m.sponsor_user_id, m.network_parent_user_id,
            m.network_slot, m.activation_status, m.activation_expires_at,
            exists (
              select 1 from "account" a
               where a."userId" = m.user_id and a."providerId" = 'credential' and a.password is not null
            ) as has_password,
            case
              when u.name = $1 then '0'
              when u.name ~ '^HW-[1-3]$' then '1'
              when u.name ~ '^HW-[1-3]\\.[1-3]$' then '2'
              when u.name ~ '^HW-[1-3]\\.[1-3]\\.[1-3]$' then '3'
              when u.name ~ '^HW-[1-3]\\.[1-3]\\.[1-3]\\.[1-3]$' then '4'
              else 'x'
            end as level
       from members m
       join "user" u on u.id = m.user_id
      where u.name = $1 or u.name ~ '^HW-[0-9]'`,
    [FOUNDATION_ROOT_LABEL],
  );
  const byLevel: Record<0 | 1 | 2 | 3 | 4, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const codes = new Set<string>();
  const byId = new Map(rows.map((r) => [r.user_id, r]));
  let active = 0;
  let commissionEligible = 0;
  let credentials = 0;
  for (const row of rows) {
    if (row.level === "x") errors.push(`unexpected foundation name ${row.name}`);
    else byLevel[Number(row.level) as 0 | 1 | 2 | 3 | 4] += 1;
    if (row.activation_status === "active") active += 1;
    if (row.activation_status === "active" && row.activation_expires_at && new Date(row.activation_expires_at) > new Date()) {
      commissionEligible += 1;
    }
    if (row.has_password) credentials += 1;
    if (codes.has(row.referral_code)) errors.push(`duplicate referral code ${row.referral_code}`);
    codes.add(row.referral_code);
    if (row.level !== "0") {
      if (!row.sponsor_user_id || row.sponsor_user_id !== row.network_parent_user_id) {
        errors.push(`${row.name} sponsor/matrix parent mismatch`);
      }
      const parent = row.network_parent_user_id ? byId.get(row.network_parent_user_id) : undefined;
      if (!parent) errors.push(`${row.name} is orphaned`);
      else if (Number(parent.level) !== Number(row.level) - 1) errors.push(`${row.name} parent level mismatch`);
    } else if (row.sponsor_user_id || row.network_parent_user_id) {
      errors.push("root must have no sponsor or matrix parent");
    }
  }
  if (rows.length !== FOUNDATION_TOTAL) errors.push(`foundation count ${rows.length}, expected ${FOUNDATION_TOTAL}`);
  for (const level of [0, 1, 2, 3, 4] as const) {
    if (byLevel[level] !== FOUNDATION_LEVEL_COUNTS[level]) {
      errors.push(`level ${level} count ${byLevel[level]}`);
    }
  }

  const childRows = await client.query<{ parent: string; n: string }>(
    `select p.name as parent, count(*)::text as n
       from members c
       join members mp on mp.user_id = c.network_parent_user_id
       join "user" p on p.id = mp.user_id
       join "user" cu on cu.id = c.user_id
      where (p.name = $1 or p.name ~ '^HW-[0-9]')
        and (cu.name = $1 or cu.name ~ '^HW-[0-9]')
      group by p.name`,
    [FOUNDATION_ROOT_LABEL],
  );
  for (const row of childRows.rows) {
    const isL3 = /^HW-[1-3]\.[1-3]\.[1-3]$/.test(row.parent);
    const isL4 = /^HW-[1-3]\.[1-3]\.[1-3]\.[1-3]$/.test(row.parent);
    const expected = isL4 ? 0 : 3;
    if (isL4) errors.push(`${row.parent} is level 4 and must have no foundation children`);
    else if (Number(row.n) !== expected && (row.parent === FOUNDATION_ROOT_LABEL || /^HW-/.test(row.parent) || isL3)) {
      if (Number(row.n) !== 3) errors.push(`${row.parent} has ${row.n} children, expected 3`);
    }
  }

  const ancestry = await client.query<{ name: string }>(
    `with recursive up as (
       select m.user_id, u.name, m.network_parent_user_id, 0 as depth
         from members m join "user" u on u.id = m.user_id
        where u.name = 'HW-2.3.1.2'
       union all
       select m.user_id, u.name, m.network_parent_user_id, up.depth + 1
         from members m
         join "user" u on u.id = m.user_id
         join up on m.user_id = up.network_parent_user_id
      )
      select name from up order by depth`,
  );
  const sampleAncestry = ancestry.rows.map((r) => r.name);
  const expectedAncestry = ["HW-2.3.1.2", "HW-2.3.1", "HW-2.3", "HW-2", FOUNDATION_ROOT_LABEL];
  if (sampleAncestry.join(">") !== expectedAncestry.join(">")) {
    errors.push(`HW-2.3.1.2 ancestry ${sampleAncestry.join(" → ") || "(missing)"}`);
  }

  const sample = rows.find((r) => r.name === "HW-2.3.1.2");
  const sampleReferral = sample
    ? { name: sample.name, code: sample.referral_code, link: referralLinkFor(sample.referral_code) }
    : null;
  if (!sampleReferral) errors.push("HW-2.3.1.2 referral missing");

  const fakePays = await client.query<{ count: string }>(
    `select count(*)::text as count from annual_activations a
       join "user" u on u.id = a.user_id
      where (u.name = $1 or u.name ~ '^HW-[0-9]') and a.amount = 1000`,
    [FOUNDATION_ROOT_LABEL],
  );
  if (Number(fakePays.rows[0]?.count ?? 0) > 0) errors.push("fake BDT 1000 activation payments exist for foundation accounts");

  const fakeBookings = await client.query<{ count: string }>(
    `select count(*)::text as count from bookings b
       join "user" u on u.id = b.user_id
      where u.name = $1 or u.name ~ '^HW-[0-9]'`,
    [FOUNDATION_ROOT_LABEL],
  );
  if (Number(fakeBookings.rows[0]?.count ?? 0) > 0) errors.push("fake foundation bookings exist");

  const wallets = rows.length;
  if (credentials !== rows.length) errors.push(`credential accounts ${credentials}/${rows.length}`);

  return {
    ok: errors.length === 0,
    errors,
    byLevel,
    active,
    commissionEligible,
    codes: codes.size,
    credentials,
    wallets,
    sampleAncestry,
    sampleReferral,
  };
}
