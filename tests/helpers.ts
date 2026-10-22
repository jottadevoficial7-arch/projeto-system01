import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { closeDb, connectionConfig, migrateDatabase } from "../src/lib/db";

/** Every test owns a fresh schema. No existing database/table is truncated. */
export async function setupTestDatabase() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      "Defina TEST_DATABASE_URL para um PostgreSQL local exclusivo de testes (nome terminado em _test).",
    );
  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test")
  )
    throw new Error(
      "TEST_DATABASE_URL deve apontar para um banco local terminado em _test.",
    );
  const admin = new Pool(connectionConfig(value));
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const previous = process.env.DATABASE_URL;
  await closeDb();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  try {
    await migrateDatabase();
  } catch (error) {
    await closeDb();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    throw error;
  }
  return async () => {
    await closeDb();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  };
}
