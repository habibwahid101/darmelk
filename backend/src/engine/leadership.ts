import type { PoolClient } from "pg";
import { uid } from "../ids.js";
import { getQualificationStatus, LEVEL_CAPACITY, type QualificationStatus } from "./network.js";

export const TZ = "Asia/Dhaka";
export const TIER_25K = 25_000;
export const TIER_50K = 50_000;
export const TIER_100K = 100_000;
export const CYCLE_MONTHS = 12;
export const DIRECT_TARGET = 3;
export const TIER_AMOUNTS = [TIER_25K, TIER_50K, TIER_100K] as const;

export type LeadershipTier = (typeof TIER_AMOUNTS)[number];

const CYCLE_COLS = `id, user_id, level5_completed_at,
       to_char(cycle_start_month, 'YYYY-MM-DD') as cycle_start_month,
       to_char(cycle_end_month, 'YYYY-MM-DD') as cycle_end_month,
       created_at`;

const CYCLE_COLS_C = `c.id, c.user_id, c.level5_completed_at,
       to_char(c.cycle_start_month, 'YYYY-MM-DD') as cycle_start_month,
       to_char(c.cycle_end_month, 'YYYY-MM-DD') as cycle_end_month,
       c.created_at`;

export type CycleRow = {
  id: string;
  user_id: string;
  level5_completed_at: Date | string;
  cycle_start_month: Date | string;
  cycle_end_month: Date | string;
  created_at: Date | string;
};

export type TierEventRow = {
  id: string;
  cycle_id: string;
  user_id: string;
  tier: number;
  eligible_at: Date | string;
  effective_month: Date | string;
  applies_in_cycle: boolean;
  evidence: unknown;
  created_at: Date | string;
};

export type EntitlementRow = {
  id: string;
  cycle_id: string;
  user_id: string;
  reward_month: Date | string;
  cycle_month: number;
  tier: number;
  amount: number;
  status: string;
  basis: unknown;
  created_at: Date | string;
  paid_at: Date | string | null;
  reversed_at: Date | string | null;
  reversed_by_admin_id: string | null;
  reversal_reason: string | null;
};

export type DirectEvidence = { user_id: string; eligible_at: string; name?: string; email?: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function calendarMonthStart(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}-01`;
}

export function addMonths(monthStart: string, n: number): string {
  const [year, month] = monthStart.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

export function followingMonth(at: Date): string {
  return addMonths(calendarMonthStart(at), 1);
}

export function cycleBounds(level5CompletedAt: Date): { start: string; end: string } {
  const start = followingMonth(level5CompletedAt);
  return { start, end: addMonths(start, CYCLE_MONTHS - 1) };
}

export function cycleMonthNumber(cycleStart: string, rewardMonth: string): number {
  const [sy, sm] = cycleStart.split("-").map(Number);
  const [ry, rm] = rewardMonth.split("-").map(Number);
  return (ry - sy) * 12 + (rm - sm) + 1;
}

export function asMonth(value: Date | string): string {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1]! : value.slice(0, 10);
  }
  // DATE values from node-pg may be UTC midnight or local midnight.
  if (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  ) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  return calendarMonthStart(value);
}

export function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function nthTimestamp(timestamps: string[], n: number): string | null {
  const sorted = timestamps.filter(Boolean).sort();
  return sorted[n - 1] ?? null;
}

export function effectiveMonthFor(
  eligibleAt: Date,
  cycleEndMonth: string,
): { month: string; applies: boolean } {
  const month = followingMonth(eligibleAt);
  return { month, applies: month <= cycleEndMonth };
}

export function tierOnMonth(
  cycleStart: string,
  cycleEnd: string,
  events: Array<{ tier: number; effective_month: string; applies_in_cycle: boolean }>,
  month: string,
): number {
  if (month < cycleStart || month > cycleEnd) return 0;
  let tier: number = TIER_25K;
  for (const event of events) {
    if (!event.applies_in_cycle) continue;
    if (event.effective_month <= month && event.tier > tier) tier = event.tier;
  }
  return tier;
}

function monthName(monthStart: string): string {
  const [year, month] = monthStart.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function getLevel5CompletedAt(client: PoolClient, userId: string): Promise<Date | null> {
  const { rows } = await client.query<{ activated_at: Date }>(
    `with recursive tree as (
       select user_id, 1 as level from members where network_parent_user_id = $1
       union all
       select m.user_id, tree.level + 1
         from members m
         join tree on m.network_parent_user_id = tree.user_id
        where tree.level < 5
     ),
     l5 as (
       select tree.user_id, min(b.activated_at) as activated_at
         from tree
         join bookings b on b.user_id = tree.user_id and b.status = 'activated'
        where tree.level = 5
        group by tree.user_id
     )
     select activated_at from l5
      order by activated_at asc, user_id asc
     offset $2 limit 1`,
    [userId, LEVEL_CAPACITY[5] - 1],
  );
  return rows[0]?.activated_at ?? null;
}

async function loadCycle(client: PoolClient, userId: string): Promise<CycleRow | null> {
  const { rows } = await client.query<CycleRow>(
    `select ${CYCLE_COLS} from leadership_reward_cycles where user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function ensureCycle(
  client: PoolClient,
  userId: string,
  completedAt: Date,
): Promise<CycleRow> {
  const existing = await loadCycle(client, userId);
  if (existing) return existing;
  const bounds = cycleBounds(completedAt);
  const id = uid("lrc");
  const { rows } = await client.query<CycleRow>(
    `insert into leadership_reward_cycles
       (id, user_id, level5_completed_at, cycle_start_month, cycle_end_month)
     values ($1, $2, $3, $4::date, $5::date)
     on conflict (user_id) do nothing
     returning ${CYCLE_COLS}`,
    [id, userId, completedAt, bounds.start, bounds.end],
  );
  if (rows[0]) return rows[0];
  const raced = await loadCycle(client, userId);
  if (!raced) throw new Error("Failed to persist leadership reward cycle");
  return raced;
}

async function loadTierEvents(client: PoolClient, cycleId: string): Promise<TierEventRow[]> {
  const { rows } = await client.query<TierEventRow>(
    `select id, cycle_id, user_id, tier, eligible_at,
            to_char(effective_month, 'YYYY-MM-DD') as effective_month,
            applies_in_cycle, evidence, created_at
       from leadership_reward_tier_events where cycle_id = $1 order by tier asc`,
    [cycleId],
  );
  return rows;
}

async function insertTierEvent(
  client: PoolClient,
  input: {
    cycleId: string;
    userId: string;
    tier: LeadershipTier;
    eligibleAt: Date;
    cycleEndMonth: string;
    evidence: DirectEvidence[];
  },
): Promise<void> {
  const effective = effectiveMonthFor(input.eligibleAt, input.cycleEndMonth);
  await client.query(
    `insert into leadership_reward_tier_events
       (id, cycle_id, user_id, tier, eligible_at, effective_month, applies_in_cycle, evidence)
     values ($1, $2, $3, $4, $5, $6::date, $7, $8::jsonb)
     on conflict (cycle_id, tier) do nothing`,
    [
      uid("lrt"),
      input.cycleId,
      input.userId,
      input.tier,
      input.eligibleAt,
      effective.month,
      effective.applies,
      JSON.stringify(input.evidence),
    ],
  );
}

async function sponseeCycles(client: PoolClient, userId: string): Promise<CycleRow[]> {
  const { rows } = await client.query<CycleRow>(
    `select ${CYCLE_COLS_C}
       from leadership_reward_cycles c
       join members m on m.user_id = c.user_id
      where m.sponsor_user_id = $1
      order by c.level5_completed_at asc, c.user_id asc`,
    [userId],
  );
  return rows;
}

async function sponseeTierEvents(
  client: PoolClient,
  userId: string,
  tier: number,
): Promise<Array<TierEventRow & { sponsor_user_id: string }>> {
  const { rows } = await client.query<TierEventRow & { sponsor_user_id: string }>(
    `select e.id, e.cycle_id, e.user_id, e.tier, e.eligible_at,
            to_char(e.effective_month, 'YYYY-MM-DD') as effective_month,
            e.applies_in_cycle, e.evidence, e.created_at, m.sponsor_user_id
       from leadership_reward_tier_events e
       join members m on m.user_id = e.user_id
      where m.sponsor_user_id = $1 and e.tier = $2
      order by e.eligible_at asc, e.user_id asc`,
    [userId, tier],
  );
  return rows;
}

async function getSponsorUserId(client: PoolClient, userId: string): Promise<string | null> {
  const { rows } = await client.query<{ sponsor_user_id: string | null }>(
    `select sponsor_user_id from members where user_id = $1`,
    [userId],
  );
  return rows[0]?.sponsor_user_id ?? null;
}

function earliestThree(rows: Array<{ user_id: string; at: Date | string }>): DirectEvidence[] {
  return [...rows]
    .sort((a, b) => {
      const cmp = asIso(a.at).localeCompare(asIso(b.at));
      return cmp !== 0 ? cmp : a.user_id.localeCompare(b.user_id);
    })
    .slice(0, DIRECT_TARGET)
    .map((row) => ({ user_id: row.user_id, eligible_at: asIso(row.at) }));
}

async function evaluateUpgrades(client: PoolClient, cycle: CycleRow): Promise<void> {
  const cycleEnd = asMonth(cycle.cycle_end_month);
  const directs25 = await sponseeCycles(client, cycle.user_id);
  if (directs25.length >= DIRECT_TARGET) {
    const evidence = earliestThree(directs25.map((row) => ({ user_id: row.user_id, at: row.level5_completed_at })));
    await insertTierEvent(client, {
      cycleId: cycle.id,
      userId: cycle.user_id,
      tier: TIER_50K,
      eligibleAt: new Date(evidence[DIRECT_TARGET - 1]!.eligible_at),
      cycleEndMonth: cycleEnd,
      evidence,
    });
  }

  const directs50 = await sponseeTierEvents(client, cycle.user_id, TIER_50K);
  if (directs50.length >= DIRECT_TARGET) {
    const evidence = earliestThree(directs50.map((row) => ({ user_id: row.user_id, at: row.eligible_at })));
    await insertTierEvent(client, {
      cycleId: cycle.id,
      userId: cycle.user_id,
      tier: TIER_100K,
      eligibleAt: new Date(evidence[DIRECT_TARGET - 1]!.eligible_at),
      cycleEndMonth: cycleEnd,
      evidence,
    });
  }
}

async function materializeEntitlements(client: PoolClient, cycle: CycleRow, asOf: Date): Promise<void> {
  const start = asMonth(cycle.cycle_start_month);
  const end = asMonth(cycle.cycle_end_month);
  const currentMonth = calendarMonthStart(asOf);
  if (currentMonth < start) return;
  const last = currentMonth < end ? currentMonth : end;
  const events = (await loadTierEvents(client, cycle.id)).map((event) => ({
    tier: event.tier,
    effective_month: asMonth(event.effective_month),
    applies_in_cycle: event.applies_in_cycle,
  }));

  for (let month = start, n = 1; month <= last; month = addMonths(month, 1), n += 1) {
    const tier = tierOnMonth(start, end, events, month);
    if (!tier) continue;
    await client.query(
      `insert into leadership_reward_entitlements
         (id, cycle_id, user_id, reward_month, cycle_month, tier, amount, status, basis)
       values ($1, $2, $3, $4::date, $5, $6, $7, 'earned', $8::jsonb)
       on conflict (cycle_id, reward_month) do nothing`,
      [
        uid("lre"),
        cycle.id,
        cycle.user_id,
        month,
        n,
        tier,
        tier,
        JSON.stringify({
          tier,
          level5_completed_at: asIso(cycle.level5_completed_at),
          effective_events: events,
        }),
      ],
    );
  }
}

async function refreshExistingCycle(client: PoolClient, userId: string, asOf: Date): Promise<void> {
  const cycle = await loadCycle(client, userId);
  if (!cycle) return;
  await evaluateUpgrades(client, cycle);
  await materializeEntitlements(client, cycle, asOf);
}

export type LeadershipSnapshot = {
  eligible: boolean;
  level5Complete: boolean;
  level5CompletedAt: string | null;
  qualification: QualificationStatus;
  cycle: null | {
    id: string;
    startMonth: string;
    endMonth: string;
    phase: "upcoming" | "active" | "completed";
    currentMonthNumber: number | null;
    currentTier: number | null;
    nextTier: number | null;
    nextTierProgress: { count: number; target: number };
    nextRequirement: string | null;
    monthsCompleted: number;
    monthsRemaining: number;
    totalEarned: number;
    finalTier: number;
  };
  entitlements: Array<{
    id: string;
    rewardMonth: string;
    cycleMonth: number;
    tier: number;
    amount: number;
    status: string;
    createdAt: string;
    paidAt: string | null;
  }>;
  projected: Array<{ rewardMonth: string; cycleMonth: number; tier: number; amount: number; status: "upcoming" }>;
  evidence: { tier50: DirectEvidence[]; tier100: DirectEvidence[] };
  tierEvents: Array<{
    tier: number;
    eligibleAt: string;
    effectiveMonth: string;
    appliesInCycle: boolean;
    evidence: DirectEvidence[];
  }>;
};

function formatAmount(n: number) {
  return `BDT ${n.toLocaleString("en-US")}`;
}

function describeNextRequirement(
  nextTier: number | null,
  remaining: number,
  nextEvent: { effective_month: string; applies_in_cycle: boolean } | undefined,
  currentMonth: string,
): string | null {
  if (!nextTier) return null;
  if (nextEvent) {
    if (!nextEvent.applies_in_cycle) {
      return "The next tier would begin after this round ends, so no additional month is created.";
    }
    if (nextEvent.effective_month > currentMonth) {
      return `${formatAmount(nextTier)} / month becomes effective ${monthName(nextEvent.effective_month)}.`;
    }
  }
  if (remaining <= 0) return null;
  const need = nextTier === TIER_50K ? TIER_25K : TIER_50K;
  const who = remaining === 1 ? "1 more personally sponsored member" : `${remaining} more personally sponsored members`;
  return `${who} must become ${formatAmount(need)} Leadership Reward eligible.`;
}

function phaseFor(start: string, end: string, currentMonth: string): "upcoming" | "active" | "completed" {
  if (currentMonth < start) return "upcoming";
  if (currentMonth > end) return "completed";
  return "active";
}

function asEvidence(value: unknown, fallback: DirectEvidence[]): DirectEvidence[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((row): row is DirectEvidence => Boolean(row && typeof row === "object" && "user_id" in row && "eligible_at" in row))
    .map((row) => ({ user_id: String(row.user_id), eligible_at: String(row.eligible_at) }));
}

async function enrichEvidence(client: PoolClient, rows: DirectEvidence[]): Promise<DirectEvidence[]> {
  if (rows.length === 0) return rows;
  const { rows: users } = await client.query<{ id: string; name: string; email: string }>(
    `select id, name, email from "user" where id = any($1::text[])`,
    [rows.map((row) => row.user_id)],
  );
  const byId = new Map(users.map((row) => [row.id, row]));
  return rows.map((row) => {
    const user = byId.get(row.user_id);
    return { ...row, name: user?.name, email: user?.email };
  });
}

async function snapshotFrom(
  client: PoolClient,
  userId: string,
  qualification: QualificationStatus,
  cycle: CycleRow | null,
  completedAt: Date | null,
  asOf: Date,
): Promise<LeadershipSnapshot> {
  if (!cycle) {
    return {
      eligible: false,
      level5Complete: qualification.level5Complete,
      level5CompletedAt: completedAt ? asIso(completedAt) : null,
      qualification,
      cycle: null,
      entitlements: [],
      projected: [],
      evidence: { tier50: [], tier100: [] },
      tierEvents: [],
    };
  }

  const start = asMonth(cycle.cycle_start_month);
  const end = asMonth(cycle.cycle_end_month);
  const currentMonth = calendarMonthStart(asOf);
  const events = await loadTierEvents(client, cycle.id);
  const mappedEvents = events.map((event) => ({
    tier: event.tier,
    effective_month: asMonth(event.effective_month),
    applies_in_cycle: event.applies_in_cycle,
  }));
  const { rows: entitlementRows } = await client.query<EntitlementRow>(
    `select id, cycle_id, user_id,
            to_char(reward_month, 'YYYY-MM-DD') as reward_month,
            cycle_month, tier, amount, status, basis, created_at, paid_at,
            reversed_at, reversed_by_admin_id, reversal_reason
       from leadership_reward_entitlements
      where cycle_id = $1
      order by reward_month asc`,
    [cycle.id],
  );
  const earned = entitlementRows.filter((row) => row.status !== "reversed");
  const totalEarned = earned.reduce((sum, row) => sum + row.amount, 0);
  const monthsCompleted = earned.length;
  const phase = phaseFor(start, end, currentMonth);
  const currentMonthNumber =
    phase === "active" ? cycleMonthNumber(start, currentMonth) : phase === "completed" ? CYCLE_MONTHS : null;
  const currentTier =
    phase === "upcoming"
      ? TIER_25K
      : phase === "completed"
        ? earned.reduce((max, row) => Math.max(max, row.tier), TIER_25K)
        : tierOnMonth(start, end, mappedEvents, currentMonth);
  const finalTier = mappedEvents.reduce((max, event) => {
    if (event.applies_in_cycle && event.effective_month <= end) return Math.max(max, event.tier);
    return max;
  }, TIER_25K as number);

  const directs25 = await sponseeCycles(client, userId);
  const directs50 = await sponseeTierEvents(client, userId, TIER_50K);
  const count25 = directs25.length;
  const count50 = directs50.length;
  const effectiveNow = currentTier ?? TIER_25K;
  const nextTier =
    phase === "completed" || effectiveNow >= TIER_100K ? null : effectiveNow >= TIER_50K ? TIER_100K : TIER_50K;
  const nextCount = nextTier === TIER_100K ? count50 : count25;
  const nextProgress = { count: Math.min(nextCount, DIRECT_TARGET), target: DIRECT_TARGET };
  const nextEvent = nextTier
    ? mappedEvents.find((event) => event.tier === nextTier)
    : undefined;

  const projected: LeadershipSnapshot["projected"] = [];
  if (phase !== "completed") {
    const from = currentMonth < start ? start : addMonths(currentMonth, 1);
    for (let month = from, n = cycleMonthNumber(start, month); month <= end; month = addMonths(month, 1), n += 1) {
      const tier = tierOnMonth(start, end, mappedEvents, month);
      projected.push({ rewardMonth: month, cycleMonth: n, tier, amount: tier, status: "upcoming" });
    }
  }

  const event50 = events.find((event) => event.tier === TIER_50K);
  const event100 = events.find((event) => event.tier === TIER_100K);
  const evidence50 = await enrichEvidence(
    client,
    asEvidence(event50?.evidence, earliestThree(directs25.map((row) => ({ user_id: row.user_id, at: row.level5_completed_at })))),
  );
  const evidence100 = await enrichEvidence(
    client,
    asEvidence(event100?.evidence, earliestThree(directs50.map((row) => ({ user_id: row.user_id, at: row.eligible_at })))),
  );

  return {
    eligible: true,
    level5Complete: true,
    level5CompletedAt: asIso(cycle.level5_completed_at),
    qualification,
    cycle: {
      id: cycle.id,
      startMonth: start,
      endMonth: end,
      phase,
      currentMonthNumber,
      currentTier,
      nextTier,
      nextTierProgress: nextProgress,
      nextRequirement: describeNextRequirement(
        nextTier,
        Math.max(0, DIRECT_TARGET - nextProgress.count),
        nextEvent,
        currentMonth,
      ),
      monthsCompleted,
      monthsRemaining: Math.max(0, CYCLE_MONTHS - monthsCompleted),
      totalEarned,
      finalTier,
    },
    entitlements: entitlementRows.map((row) => ({
      id: row.id,
      rewardMonth: asMonth(row.reward_month),
      cycleMonth: row.cycle_month,
      tier: row.tier,
      amount: row.amount,
      status: row.status,
      createdAt: asIso(row.created_at),
      paidAt: row.paid_at ? asIso(row.paid_at) : null,
    })),
    projected,
    evidence: {
      tier50: evidence50,
      tier100: evidence100,
    },
    tierEvents: events.map((event) => ({
      tier: event.tier,
      eligibleAt: asIso(event.eligible_at),
      effectiveMonth: asMonth(event.effective_month),
      appliesInCycle: event.applies_in_cycle,
      evidence: asEvidence(event.evidence, []),
    })),
  };
}

export async function syncLeadershipReward(
  client: PoolClient,
  userId: string,
  asOf: Date = new Date(),
): Promise<LeadershipSnapshot> {
  const qualification = await getQualificationStatus(client, userId);
  const existing = await loadCycle(client, userId);
  const completedAt = existing ? new Date(asIso(existing.level5_completed_at)) : await getLevel5CompletedAt(client, userId);
  if (!existing && !completedAt) {
    return snapshotFrom(client, userId, qualification, null, null, asOf);
  }
  const cycle = existing ?? (await ensureCycle(client, userId, completedAt!));
  await evaluateUpgrades(client, cycle);
  await materializeEntitlements(client, cycle, asOf);

  const sponsorId = await getSponsorUserId(client, userId);
  if (sponsorId && sponsorId !== userId) {
    await refreshExistingCycle(client, sponsorId, asOf);
    const grandId = await getSponsorUserId(client, sponsorId);
    if (grandId && grandId !== userId && grandId !== sponsorId) {
      await refreshExistingCycle(client, grandId, asOf);
    }
  }

  return snapshotFrom(client, userId, qualification, cycle, completedAt, asOf);
}

export async function listLeadershipRewardSummaries(client: PoolClient, asOf: Date = new Date()) {
  const { rows: ids } = await client.query<{ user_id: string }>(
    `select user_id from leadership_reward_cycles order by cycle_start_month desc, user_id asc`,
  );
  for (const row of ids) {
    await syncLeadershipReward(client, row.user_id, asOf);
  }

  const { rows } = await client.query<
    CycleRow & {
      name: string;
      email: string;
      current_tier: number | null;
      total_earned: number | string;
      months_earned: number | string;
    }
  >(
    `select c.id, c.user_id, c.level5_completed_at,
            to_char(c.cycle_start_month, 'YYYY-MM-DD') as cycle_start_month,
            to_char(c.cycle_end_month, 'YYYY-MM-DD') as cycle_end_month,
            c.created_at, u.name, u.email,
            coalesce((
              select e.tier from leadership_reward_entitlements e
               where e.cycle_id = c.id and e.status <> 'reversed'
               order by e.reward_month desc limit 1
            ), $1) as current_tier,
            coalesce((
              select sum(e.amount) from leadership_reward_entitlements e
               where e.cycle_id = c.id and e.status <> 'reversed'
            ), 0) as total_earned,
            coalesce((
              select count(*) from leadership_reward_entitlements e
               where e.cycle_id = c.id and e.status <> 'reversed'
            ), 0) as months_earned
       from leadership_reward_cycles c
       join "user" u on u.id = c.user_id
      order by c.cycle_start_month desc, u.name asc`,
    [TIER_25K],
  );
  return rows.map((row) => {
    const start = asMonth(row.cycle_start_month);
    const end = asMonth(row.cycle_end_month);
    const currentMonth = calendarMonthStart(asOf);
    return {
      userId: row.user_id,
      name: row.name,
      email: row.email,
      cycleId: row.id,
      startMonth: start,
      endMonth: end,
      phase: phaseFor(start, end, currentMonth),
      currentMonthNumber:
        currentMonth < start ? null : currentMonth > end ? CYCLE_MONTHS : cycleMonthNumber(start, currentMonth),
      currentTier: Number(row.current_tier ?? TIER_25K),
      totalEarned: Number(row.total_earned ?? 0),
      monthsEarned: Number(row.months_earned ?? 0),
      level5CompletedAt: asIso(row.level5_completed_at),
    };
  });
}
