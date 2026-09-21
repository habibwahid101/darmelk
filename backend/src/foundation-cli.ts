import {
  FOUNDATION_TOTAL,
  foundationRegistryCsv,
  listFoundationRegistry,
  validateFoundation,
} from "./engine/foundation.ts";

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`) || process.argv.some((a) => a.startsWith(`--${name}=`));
}

function dbTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const forbidden = ["confirm-reset", "confirm-production", "force-rebuild", "execute", "rebuild"].filter(hasFlag);
  if (forbidden.length > 0) {
    console.error(
      `Foundation bootstrap execution is closed. Refusing ${forbidden.map((f) => `--${f}`).join(", ")}. Use read-only registry export only.`,
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const format = hasFlag("csv") ? "csv" : "json";
  if (!databaseUrl) {
    console.error("DATABASE_URL is required for the read-only foundation registry export.");
    process.exit(1);
  }

  const { getPool } = await import("./db.ts");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    const rows = await listFoundationRegistry(client);
    const validation = await validateFoundation(client);
    await client.query("ROLLBACK");
    if (format === "csv") {
      process.stdout.write(foundationRegistryCsv(rows) + "\n");
    } else {
      console.log(
        JSON.stringify(
          {
            readOnly: true,
            database: dbTarget(databaseUrl),
            productionWritesPerformed: false,
            rowCount: rows.length,
            expected: FOUNDATION_TOTAL,
            validation: {
              ok: validation.ok,
              errors: validation.errors,
              byLevel: validation.byLevel,
              active: validation.active,
              commissionEligible: validation.commissionEligible,
              codes: validation.codes,
              credentials: validation.credentials,
            },
            rows,
          },
          null,
          2,
        ),
      );
    }
    if (rows.length !== FOUNDATION_TOTAL || !validation.ok) process.exit(1);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
