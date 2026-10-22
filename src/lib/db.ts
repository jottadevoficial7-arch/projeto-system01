import { AsyncLocalStorage } from "node:async_hooks";
import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResultRow,
} from "pg";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./database-schema";

export class StorageError extends Error {
  constructor(
    public code: string,
    public operation: string,
  ) {
    super(`PostgreSQL: ${code}`);
  }
}

export function storageError(error: unknown, operation: string): StorageError {
  if (error instanceof StorageError) return error;
  const code = (error as { code?: unknown })?.code;
  return new StorageError(
    typeof code === "string" && /^[A-Z0-9_]+$/.test(code)
      ? code
      : "DATABASE_FAILURE",
    operation,
  );
}

/** Remote connections always verify TLS. Never accept sslmode=no-verify. */
export function connectionConfig(
  url = process.env.DATABASE_URL || process.env.POSTGRES_URL,
): PoolConfig {
  if (!url) throw new StorageError("DATABASE_URL_MISSING", "configure");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new StorageError("DATABASE_URL_INVALID", "configure");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw new StorageError("DATABASE_URL_INVALID", "configure");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const mode = parsed.searchParams.get("sslmode");
  if (
    mode === "no-verify" ||
    (!local &&
      (mode === "disable" || parsed.searchParams.get("ssl") === "false"))
  ) {
    throw new StorageError("DATABASE_TLS_REQUIRED", "configure");
  }
  // pg URL SSL parameters can replace the ssl object; remove them to enforce verification.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"])
    parsed.searchParams.delete(key);
  return {
    connectionString: parsed.toString(),
    ssl:
      local && (!mode || mode === "disable")
        ? false
        : { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: "the-system",
    allowExitOnIdle: true,
  };
}

const globalDb = globalThis as unknown as { systemPgPool?: Pool };
const context = new AsyncLocalStorage<PoolClient>();
export function getPool(): Pool {
  if (!globalDb.systemPgPool) {
    const pool = new Pool(connectionConfig());
    pool.on("error", (error) => {
      const safe = storageError(error, "pool");
      console.error("[THE SYSTEM] storage", {
        code: safe.code,
        operation: safe.operation,
      });
    });
    globalDb.systemPgPool = pool;
  }
  return globalDb.systemPgPool;
}

/** Only internal SQL is accepted here. Values always travel as bound parameters. */
function placeholders(sql: string): string {
  let index = 0;
  let quote = "";
  let result = "";
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (quote) {
      result += char;
      if (char === quote) {
        if (sql[i + 1] === quote) result += sql[++i];
        else quote = "";
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else result += char === "?" ? `$${++index}` : char;
  }
  return result;
}

export async function query<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  values: unknown[] = [],
) {
  try {
    return await (context.getStore() || getPool()).query<T>(sql, values);
  } catch (error) {
    throw storageError(error, "query");
  }
}
const database = {
  prepare(sql: string) {
    const text = placeholders(sql);
    return {
      async get(...values: unknown[]) {
        return (await query(text, values)).rows[0];
      },
      async all(...values: unknown[]) {
        return (await query(text, values)).rows;
      },
      async run(...values: unknown[]) {
        return { changes: (await query(text, values)).rowCount };
      },
    };
  },
  async exec(sql: string) {
    await query(sql);
  },
};
export function getDb() {
  return database;
}
export async function closeDb() {
  const pool = globalDb.systemPgPool;
  delete globalDb.systemPgPool;
  await pool?.end();
}

export async function transaction<T>(
  operation: (db: typeof database) => Promise<T>,
): Promise<T> {
  if (context.getStore()) return operation(database);
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (error) {
    throw storageError(error, "connect");
  }
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await context.run(client, () => operation(database));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

/** Serialize every read/modify/write for an account across serverless instances. */
export async function withUserTransaction<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return transaction(async () => {
    await query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `user:${userId}`,
    ]);
    return operation();
  });
}

/** Explicit administrative command; never called by API requests or the build. */
export async function migrateDatabase() {
  return transaction(async () => {
    await query("SELECT pg_advisory_xact_lock(90813001)");
    await query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const versions = (
      await query<{ version: number }>(
        "SELECT version FROM schema_migrations ORDER BY version",
      )
    ).rows;
    if (versions.some((row) => row.version > SCHEMA_VERSION))
      throw new StorageError("DATABASE_SCHEMA_NEWER", "migrate");
    if (!versions.some((row) => row.version === 1)) {
      await query(SCHEMA_SQL);
      await query("INSERT INTO schema_migrations (version) VALUES (1)");
    }
  });
}

export async function checkDatabase() {
  const result = await query<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
  );
  if (result.rows[0]?.version !== SCHEMA_VERSION)
    throw new StorageError("DATABASE_MIGRATION_REQUIRED", "health");
  // Also checks runtime privileges and all data tables without exposing user data.
  await query(
    "SELECT 1 FROM users, sessions, missions, completions, rest_days, day_assessments, rate_limits LIMIT 0",
  );
  return { status: "ok", storage: "postgresql", schemaVersion: SCHEMA_VERSION };
}
export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  password_hash: string | null;
  password_salt: string | null;
  is_demo: number;
  avatar: string;
  goal: string;
  daily_minutes: number;
  created_at: string;
  discipline: number;
  last_assessed: string;
};
