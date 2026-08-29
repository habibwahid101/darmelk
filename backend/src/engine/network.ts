// Unified 3x5 network (forced matrix): every member has at most 3 matrix
// children (network_slot 1..3) and commissions flow up to 5 matrix ancestor
// levels: L1=3, L2=9, L3=27, L4=81, L5=243, 363 total, max level 5.
//
// Matrix placement is DELIBERATELY separate from sponsorship:
//   - sponsor_user_id   : who personally referred the member (qualification's
//                          "personally sponsor 3" test reads this).
//   - network_parent_id  : where the member sits in the matrix (commission
//     / network_slot       flow reads this). Defaults to the sponsor's own
//                          matrix node; once that node's 3 slots are full, new
//                          sponsees spill over to the next open slot in the
//                          sponsor's matrix subtree (breadth-first) — standard
//                          forced-matrix behavior, and the reason a member's
//                          matrix parent can differ from their sponsor.
import type { PoolClient } from "pg";
import { conflict } from "../errors.js";

export const MAX_LEVEL = 5;
export const PERSONAL_SPONSOR_TARGET = 3;
export const LEVEL_CAPACITY: Record<number, number> = { 1: 3, 2: 9, 3: 27, 4: 81, 5: 243 };
export const TOTAL_POSITIONS = 363;

/**
 * Find the first matrix node with a free child slot, breadth-first starting
 * at `rootUserId` (the sponsor). Must be called inside the same transaction
 * that inserts the new member row — the unique constraint on
 * (network_parent_user_id, network_slot) is the final safety net if two
 * concurrent placements race for the same slot (caller should retry once on
 * a unique-violation).
 */
export async function findOpenMatrixSlot(
  client: PoolClient,
  rootUserId: string,
): Promise<{ parentUserId: string; slot: 1 | 2 | 3 }> {
  let frontier = [rootUserId];
  const visited = new Set<string>();
  while (frontier.length > 0) {
    const { rows } = await client.query<{ user_id: string; taken_slots: number[] }>(
      `select m.user_id,
              coalesce(array_agg(c.network_slot) filter (where c.network_slot is not null), '{}') as taken_slots
         from members m
         left join members c on c.network_parent_user_id = m.user_id
        where m.user_id = any($1::text[])
        group by m.user_id`,
      [frontier],
    );
    const byId = new Map(rows.map((r) => [r.user_id, r.taken_slots]));
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      const taken = new Set(byId.get(id) ?? []);
      for (const slot of [1, 2, 3] as const) {
        if (!taken.has(slot)) {
          return { parentUserId: id, slot };
        }
      }
    }
    // Every node in this level is full — descend to their children, in the
    // order they were placed, for the next breadth-first pass.
    const { rows: childRows } = await client.query<{ user_id: string }>(
      `select user_id from members
        where network_parent_user_id = any($1::text[])
        order by network_parent_user_id, network_slot`,
      [frontier],
    );
    for (const r of childRows) nextFrontier.push(r.user_id);
    frontier = nextFrontier;
  }
  throw conflict("Network matrix is full under this sponsor (should not happen before level 5+1)");
}

export type LevelCounts = Record<1 | 2 | 3 | 4 | 5, number>;

/** Matrix subtree fill, levels 1-5, walked from the member's own matrix node. */
export async function getLevelCounts(client: PoolClient, userId: string): Promise<LevelCounts> {
  const { rows } = await client.query<{ level: number; count: string }>(
    `with recursive tree as (
       select user_id, 1 as level from members where network_parent_user_id = $1
       union all
       select m.user_id, tree.level + 1
         from members m
         join tree on m.network_parent_user_id = tree.user_id
        where tree.level < 5
     )
     select level, count(*)::text as count from tree group by level`,
    [userId],
  );
  const counts: LevelCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) {
    if (r.level >= 1 && r.level <= 5) counts[r.level as 1 | 2 | 3 | 4 | 5] = Number(r.count);
  }
  return counts;
}

/** Personally-sponsored, ACTIVATED members (the "sponsor 3" qualification test). */
export async function getEligibleSponsorCount(client: PoolClient, userId: string): Promise<number> {
  const row = await client.query<{ count: string }>(
    `select count(*)::text as count from members
      where sponsor_user_id = $1 and activation_status = 'active'`,
    [userId],
  );
  return Number(row.rows[0]?.count ?? 0);
}

export type QualificationStatus = {
  sponsorCount: number;
  sponsorTarget: number;
  levelCounts: LevelCounts;
  level5Complete: boolean;
  qualified: boolean;
};

export async function getQualificationStatus(client: PoolClient, userId: string): Promise<QualificationStatus> {
  // Sequential, not Promise.all: both queries run on the SAME PoolClient
  // (deliberately — this is called from inside a single transaction), and a
  // pg client can only have one query in flight at a time.
  const sponsorCount = await getEligibleSponsorCount(client, userId);
  const levelCounts = await getLevelCounts(client, userId);
  const level5Complete = levelCounts[5] >= LEVEL_CAPACITY[5];
  return {
    sponsorCount,
    sponsorTarget: PERSONAL_SPONSOR_TARGET,
    levelCounts,
    level5Complete,
    qualified: sponsorCount >= PERSONAL_SPONSOR_TARGET && level5Complete,
  };
}

/** Matrix ancestors of `userId`, nearest first, up to MAX_LEVEL — who commission for this member's bookings flows to. */
export async function getMatrixAncestors(
  client: PoolClient,
  userId: string,
): Promise<Array<{ userId: string; level: number }>> {
  const { rows } = await client.query<{ user_id: string; level: number }>(
    `with recursive up as (
       select network_parent_user_id as user_id, 1 as level
         from members where user_id = $1
       union all
       select m.network_parent_user_id, up.level + 1
         from members m
         join up on m.user_id = up.user_id
        where up.level < $2 and m.network_parent_user_id is not null
     )
     select user_id, level from up where user_id is not null order by level asc`,
    [userId, MAX_LEVEL],
  );
  return rows.map((r) => ({ userId: r.user_id, level: r.level }));
}
