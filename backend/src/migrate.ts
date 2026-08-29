// Migration runner — ported from scripts/migrate.mjs (same _migrations
// bookkeeping, same ordered-file convention) but invoked as a Lambda action
// instead of at Vercel build time, because the Vercel build no longer has a
// network path to this private RDS instance. GitHub Actions triggers this by
// invoking the Lambda directly (`aws lambda invoke`) with
// `{ "action": "migrate" }` after deploying new code — that's a control-plane
// API call, not a database connection, so it works from outside the VPC.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPool } from "./db.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

function migrationName(path: string): string {
  return path.split("/").pop() ?? path;
}

function pendingMigrations(
  paths: string[],
  applied: string[],
): Array<{ name: string; path: string }> {
  const done = new Set(applied);
  return paths
    .filter((p) => p.endsWith(".sql"))
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}

/** One-off introspection used before the very first migration run, to check
 * what (if anything) already lives in the target database before writing to
 * it — see the "describe" Lambda maintenance action in handler.ts. */
export async function describeSchema(): Promise<{ database: string; tables: string[] }> {
  const pool = getPool();
  const dbRow = await pool.query<{ current_database: string }>("select current_database()");
  const tables = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  return { database: dbRow.rows[0]!.current_database, tables: tables.rows.map((r) => r.table_name) };
}

export async function runMigrations(): Promise<{ applied: string[] }> {
  const entries = await readdir(migrationsDir);
  const pool = getPool();
  const client = await pool.connect();
  const appliedNow: string[] = [];
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const already = (await client.query<{ name: string }>("SELECT name FROM _migrations")).rows.map(
      (r) => r.name,
    );

    for (const { name, path } of pendingMigrations(entries, already)) {
      const text = await readFile(join(migrationsDir, path), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(text);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(`migration ${name} failed: ${(err as Error).message}`);
      }
      appliedNow.push(name);
    }
    return { applied: appliedNow };
  } finally {
    client.release();
  }
}
