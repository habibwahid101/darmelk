import type { PoolClient } from "pg";

export const FOUNDATION_ROOT_LABEL = "Habib Wahid-Root ID";
export const FOUNDATION_BRANCHING = 3;
export const FOUNDATION_DEPTH = 4;
export const FOUNDATION_TOTAL = 121;
export const FOUNDATION_LEVEL_COUNTS = { 0: 1, 1: 3, 2: 9, 3: 27, 4: 81 } as const;
export const FOUNDATION_EMAIL_DOMAIN = "foundation.darmelk.invalid";
export const FOUNDATION_SITE_ORIGIN = "https://darmelk.com";
export const FOUNDATION_ACTIVATION_WAIVER = "Habib Wahid 121-ID foundation setup";
export const FOUNDATION_ACTIVATION_EXPIRES_AT = "9999-12-31T23:59:59.000Z";
export const FLAGSHIP_SLUG = "five-star-hotel-share";

export type FoundationNode = {
  label: string;
  displayName: string;
  parentLabel: string | null;
  level: 0 | 1 | 2 | 3 | 4;
  slot: 1 | 2 | 3 | null;
};

export type FoundationRegistryRow = {
  label: string;
  loginEmail: string;
  referralCode: string;
  referralUrl: string;
  level: 0 | 1 | 2 | 3 | 4;
  sponsorLabel: string | null;
  networkParentLabel: string | null;
  slot: 1 | 2 | 3 | null;
};

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

export function activationExpiryIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isFoundationActivationSentinel(value: string | Date | null | undefined): boolean {
  return activationExpiryIso(value) === FOUNDATION_ACTIVATION_EXPIRES_AT;
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

export function foundationRegistryCsv(rows: FoundationRegistryRow[]): string {
  const header = [
    "label",
    "login_email",
    "referral_code",
    "referral_url",
    "level",
    "sponsor_label",
    "network_parent_label",
    "slot",
  ];
  const escape = (value: string | number | null) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    header.join(","),
    ...rows.map((r) =>
      [
        r.label,
        r.loginEmail,
        r.referralCode,
        r.referralUrl,
        r.level,
        r.sponsorLabel,
        r.networkParentLabel,
        r.slot,
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\n");
}

export async function listFoundationRegistry(client: PoolClient): Promise<FoundationRegistryRow[]> {
  const { rows } = await client.query<{
    label: string;
    login_email: string;
    referral_code: string;
    network_slot: number | null;
    sponsor_label: string | null;
    network_parent_label: string | null;
    level: string;
  }>(
    `select u.name as label,
            u.email as login_email,
            m.referral_code,
            m.network_slot,
            su.name as sponsor_label,
            pu.name as network_parent_label,
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
       left join "user" su on su.id = m.sponsor_user_id
       left join "user" pu on pu.id = m.network_parent_user_id
      where u.name = $1 or u.name ~ '^HW-[0-9]'
      order by level, u.name`,
    [FOUNDATION_ROOT_LABEL],
  );
  return rows.map((row) => {
    const level = Number(row.level);
    if (level !== 0 && level !== 1 && level !== 2 && level !== 3 && level !== 4) {
      throw new Error(`unexpected foundation label ${row.label}`);
    }
    const slot = row.network_slot == null ? null : (Number(row.network_slot) as 1 | 2 | 3);
    return {
      label: row.label,
      loginEmail: row.login_email,
      referralCode: row.referral_code,
      referralUrl: referralLinkFor(row.referral_code),
      level: level as 0 | 1 | 2 | 3 | 4,
      sponsorLabel: row.sponsor_label,
      networkParentLabel: row.network_parent_label,
      slot,
    };
  });
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
    if (!isFoundationActivationSentinel(row.activation_expires_at)) {
      errors.push(`${row.name} expiry is not the foundation sentinel`);
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
    const isL4 = /^HW-[1-3]\.[1-3]\.[1-3]\.[1-3]$/.test(row.parent);
    if (isL4) errors.push(`${row.parent} is level 4 and must have no foundation children`);
    else if (Number(row.n) !== 3) errors.push(`${row.parent} has ${row.n} children, expected 3`);
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
