import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { importSqlite } from "../scripts/sqlite-import";
import { setupTestDatabase } from "./helpers";
import { closeDb, query } from "../src/lib/db";
import { findSession, hashPassword } from "../src/lib/auth";
import { exportUserData, getState, login } from "../src/lib/service";
import { DATA_TABLES } from "../src/lib/database-schema";
const NOW = new Date("2026-10-19T15:00:00Z");
const token = "a".repeat(64);
let cleanup: () => Promise<void>;
let directory: string;
let source: string;
let sqlite: DatabaseSync;
beforeEach(async () => {
  cleanup = await setupTestDatabase();
  directory = mkdtempSync(join(tmpdir(), "system-migration-test-")); // Only disposable test fixtures.
  source = join(directory, "legacy.sqlite");
  sqlite = new DatabaseSync(source);
  sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  sqlite.exec(
    readFileSync(
      new URL("./fixtures/legacy-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  const { hash, salt } = hashPassword("migration-password-123");
  sqlite
    .prepare(
      "INSERT INTO users (id,name,email,password_hash,password_salt,created_at,last_assessed,discipline) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      "u1",
      "Alex",
      "legacy@example.test",
      hash,
      salt,
      "2026-10-18T15:00:00Z",
      "2026-10-18",
      97,
    );
  sqlite
    .prepare("INSERT INTO sessions VALUES (?,?,?)")
    .run(
      createHash("sha256").update(token).digest("hex"),
      "u1",
      Date.now() + 86400000,
    );
  sqlite
    .prepare(
      "INSERT INTO missions (id,user_id,title,category,difficulty,duration,frequency,time,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "m1",
      "u1",
      "Leitura",
      "knowledge",
      "medium",
      20,
      "daily",
      "12:00",
      "2026-10-18T15:00:00Z",
    );
  sqlite
    .prepare("INSERT INTO completions VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(
      "c1",
      "u1",
      "m1",
      "day:2026-10-19",
      "Leitura",
      "leitura",
      "knowledge",
      "medium",
      20,
      "2026-10-19",
      NOW.toISOString(),
    );
  sqlite
    .prepare("INSERT INTO rest_days VALUES (?,?,?)")
    .run("u1", "2026-10-18", "2026-10-18T15:00:00Z");
  sqlite
    .prepare("INSERT INTO day_assessments VALUES (?,?,?,?,?,?,?)")
    .run("u1", "2026-10-18", 0, 1, 1, 0, 1);
  sqlite
    .prepare("INSERT INTO rate_limits VALUES (?,?,?)")
    .run("key", 2, Date.now() + 60000);
});
afterEach(async () => {
  sqlite?.close();
  await cleanup?.();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
const apply = (name = "backup.sqlite") =>
  importSqlite({
    source,
    apply: true,
    backupPath: join(directory, name),
    writesStopped: true,
  });
async function assertEmpty() {
  for (const table of DATA_TABLES)
    assert.equal((await query(`SELECT * FROM ${table}`)).rows.length, 0);
}
function fileHash(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("dry-run validates all seven tables and performs no destination or source writes", async () => {
  const original = [fileHash(source), fileHash(source + "-wal")];
  const result = await importSqlite({ source });
  assert.equal(result.mode, "dry-run");
  assert.deepEqual(Object.values(result.counts), [1, 1, 1, 1, 1, 1, 1]);
  await assertEmpty();
  assert.deepEqual([fileHash(source), fileHash(source + "-wal")], original);
  assert.equal(
    readdirSync(directory).some((name) => name.includes("backup")),
    false,
  );
});

test("verified import includes WAL, preserves login, sessions, XP and complete history after reconnection", async () => {
  const original = [fileHash(source), fileHash(source + "-wal")];
  const result = await apply();
  assert.equal(result.mode, "applied");
  assert.equal(result.verified, true);
  assert.equal(statSync(join(directory, "backup.sqlite")).mode & 0o777, 0o600);
  assert.deepEqual([fileHash(source), fileHash(source + "-wal")], original);
  await closeDb();
  assert.equal(
    await login({
      email: "legacy@example.test",
      password: "migration-password-123",
    }),
    "u1",
  );
  const request = new Request("https://system.example/api/system", {
    headers: { cookie: `system_session=${token}` },
  });
  assert.equal((await findSession(request))?.id, "u1");
  const state = await getState("u1", NOW);
  assert.equal(state.progress.totalXp, 20);
  assert.equal(state.progress.discipline, 97);
  assert.equal(state.progress.totalCompleted, 1);
  const data = await exportUserData("u1", NOW);
  assert.equal(data.completions[0].id, "c1");
  assert.equal(data.assessments[0].disciplineDelta, 0);
  assert.equal(data.assessments[0].rulesVersion, 1);
  const backupDb = new DatabaseSync(join(directory, "backup.sqlite"), {
    readOnly: true,
  });
  try {
    assert.equal(
      backupDb.prepare("SELECT COUNT(*) AS count FROM completions").get()
        ?.count,
      1,
    );
  } finally {
    backupDb.close();
  }
});

test("repeat imports and populated destinations are rejected without changing existing rows", async () => {
  await apply();
  const before = await query("SELECT * FROM users");
  await assert.rejects(
    () => apply("second-backup.sqlite"),
    /Destino não está vazio/,
  );
  assert.deepEqual((await query("SELECT * FROM users")).rows, before.rows);
  assert.equal((await query("SELECT * FROM completions")).rows.length, 1);
});

test("mid-import PostgreSQL failure rolls back every table and retains the backup", async () => {
  await query(
    "CREATE FUNCTION reject_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$",
  );
  await query(
    "CREATE TRIGGER reject_import BEFORE INSERT ON completions FOR EACH ROW EXECUTE FUNCTION reject_import()",
  );
  await assert.rejects(() => apply());
  await assertEmpty();
  assert.ok(statSync(join(directory, "backup.sqlite")).size > 0);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS count FROM users").get()?.count,
    1,
  );
});

test("apply requires stopped writers and a new backup path; existing backups are never overwritten", async () => {
  await assert.rejects(
    () => importSqlite({ source, apply: true }),
    /Aplicar exige/,
  );
  const backupPath = join(directory, "existing.sqlite");
  writeFileSync(backupPath, "preserve-me");
  await assert.rejects(() =>
    importSqlite({ source, apply: true, backupPath, writesStopped: true }),
  );
  assert.equal(readFileSync(backupPath, "utf8"), "preserve-me");
  await assertEmpty();
});

test("missing source and incompatible source schema fail without creating user records", async () => {
  await assert.rejects(() =>
    importSqlite({ source: join(directory, "missing.sqlite") }),
  );
  sqlite.exec("ALTER TABLE users ADD COLUMN unrecognized_data TEXT");
  await assert.rejects(() => importSqlite({ source }), /Schema incompatível/);
  await assertEmpty();
});
