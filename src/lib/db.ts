import { Pool, type QueryResultRow } from "pg";

declare global {
  var __frPool: Pool | undefined;
}

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

export const pool: Pool = global.__frPool ?? makePool();
if (process.env.NODE_ENV !== "production") global.__frPool = pool;

export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
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
  const client = await pool.connect();
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
