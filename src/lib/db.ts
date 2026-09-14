import { Pool, type QueryResultRow } from "pg";

declare global {
  var __frPool: Pool | undefined;
}

let productionPool: Pool | undefined;

function makePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const configured = Number(process.env.FR_DB_POOL_SIZE ?? 10);
  const max = Number.isInteger(configured) ? Math.min(30, Math.max(1, configured)) : 10;
  return new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: "sarvekshan",
  });
}

/**
 * Do not create the pool while this module is imported. Next.js imports route
 * modules while building the standalone image, and build machines should not
 * need (or receive) a runtime database secret.
 */
function pool(): Pool {
  const existing = process.env.NODE_ENV === "production" ? productionPool : global.__frPool;
  if (existing) return existing;

  const created = makePool();
  if (process.env.NODE_ENV === "production") productionPool = created;
  else global.__frPool = created;
  return created;
}

export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function q1<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Run a set of statements in one transaction. */
export async function tx<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Test-process cleanup; application servers keep their pool for their lifetime. */
export async function closePool(): Promise<void> {
  const active = process.env.NODE_ENV === "production" ? productionPool : global.__frPool;
  if (!active) return;
  if (process.env.NODE_ENV === "production") productionPool = undefined;
  else global.__frPool = undefined;
  await active.end();
}
