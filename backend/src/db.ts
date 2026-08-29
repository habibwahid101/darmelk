// Postgres access for the Lambda backend. Always talks to real Postgres
// (DATABASE_URL is required — there is no PGLite fallback here, unlike the
// Vercel app's src/lib/db.ts, which this mirrors for parity).
import { Pool, type PoolClient, types } from "pg";

const OID_INT8 = 20;
const OID_NUMERIC = 1700;
types.setTypeParser(OID_INT8, (v) => Number(v));
types.setTypeParser(OID_NUMERIC, (v) => Number(v));

let pool: Pool | undefined;

/**
 * SSL is on by default (production RDS). Set DATABASE_SSL=false only for
 * local/CI Postgres that has no TLS. Anything other than the string "false"
 * (including unset) keeps SSL enabled.
 */
function sslOption(): false | { rejectUnauthorized: boolean } {
  if (process.env.DATABASE_SSL === "false") return false;
  // TLS required for RDS. Chain validation is relaxed: Node's default trust
  // store doesn't include Amazon's RDS CA, and this connection never leaves
  // the private VPC (Lambda and RDS share the same subnets, RDS ingress is
  // locked to the Lambda security group only). Traffic is still encrypted.
  return { rejectUnauthorized: false };
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({
      connectionString,
      max: 3, // Lambda: one execution env, a handful of concurrent queries at most
      idleTimeoutMillis: 30_000,
      ssl: sslOption(),
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/**
 * Run `fn` inside a single Postgres transaction. Commits on success, rolls
 * back on any thrown error (including a failed `ON CONFLICT` assertion the
 * caller raises deliberately). Every multi-row financial write in this
 * backend (booking confirmation -> commission postings, reversals,
 * activation approval, withdrawal decisions) goes through this so partial
 * writes can never be observed.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // connection died — original error is what matters
    }
    throw err;
  } finally {
    client.release();
  }
}
