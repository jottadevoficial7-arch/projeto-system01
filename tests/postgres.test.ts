import assert from "node:assert/strict";
import { afterEach, beforeEach, test, mock } from "node:test";
import { setupTestDatabase } from "./helpers";
import {
  checkDatabase,
  closeDb,
  connectionConfig,
  getDb,
  migrateDatabase,
  query,
  StorageError,
  transaction,
} from "../src/lib/db";
import {
  completeMission,
  createMission,
  getState,
  register,
  reconcileDays,
  updateProfile,
} from "../src/lib/service";
import { ApiError, rateLimit } from "../src/lib/auth";
import { GET as systemGet } from "../src/app/api/system/route";
import { GET as healthGet } from "../src/app/api/health/route";
const NOW = new Date("2026-10-19T15:00:00Z");
let cleanup: () => Promise<void>;
beforeEach(async () => {
  cleanup = await setupTestDatabase();
});
afterEach(async () => {
  await cleanup?.();
  mock.restoreAll();
});
const account = () =>
  register(
    {
      name: "Alex",
      email: "alex@example.test",
      password: "a-test-password-123",
    },
    NOW,
  );

test("simultaneous completion requests award XP only once", async () => {
  const id = await account();
  const mission = (await getState(id, NOW)).missions[0];
  const results = await Promise.all(
    Array.from({ length: 20 }, () => completeMission(id, mission.id, NOW)),
  );
  assert.equal(results.filter((r) => !r.alreadyCompleted).length, 1);
  assert.equal(
    results.reduce((sum, r) => sum + r.xpAwarded, 0),
    mission.xp,
  );
  assert.equal((await getState(id, NOW)).progress.totalCompleted, 1);
});

test("parallel completions across independent pool connections respect the daily XP cap", async () => {
  const id = await account();
  const ids = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      createMission(
        id,
        {
          title: `Atividade concorrente ${i}`,
          category: "knowledge",
          difficulty: "hard",
          duration: 30,
          frequency: "daily",
          time: "",
        },
        NOW,
      ),
    ),
  );
  const results = await Promise.all(
    ids.map((task) => completeMission(id, task, NOW)),
  );
  assert.equal(
    results.reduce((sum, r) => sum + r.xpAwarded, 0),
    150,
  );
  const state = await getState(id, NOW);
  assert.equal(state.progress.totalXp, 150);
  assert.equal(state.progress.totalCompleted, 10);
});

test("parallel reconciliation and partial profile changes do not lose updates", async () => {
  const id = await account();
  const tomorrow = new Date("2026-10-20T15:00:00Z");
  await Promise.all(
    Array.from({ length: 10 }, () => reconcileDays(id, tomorrow)),
  );
  assert.equal(
    (await query("SELECT * FROM day_assessments WHERE user_id = $1", [id])).rows
      .length,
    1,
  );
  const expected = (await getState(id, tomorrow)).progress.discipline;
  await Promise.all([
    updateProfile(id, { name: "Novo nome" }),
    updateProfile(id, { goal: "Minha meta" }),
  ]);
  const state = await getState(id, tomorrow);
  assert.equal(state.user.name, "Novo nome");
  assert.equal(state.user.goal, "Minha meta");
  assert.equal(state.progress.discipline, expected);
});

test("parallel registration has one account and gives a conflict for the rest", async () => {
  const results = await Promise.allSettled(Array.from({ length: 5 }, account));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    results
      .filter((r) => r.status === "rejected")
      .every((r) => r.reason instanceof ApiError && r.reason.status === 409),
  );
  assert.equal((await query("SELECT * FROM users")).rows.length, 1);
  assert.equal((await query("SELECT * FROM missions")).rows.length, 6);
});

test("rate limits are atomic across simultaneous requests", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      rateLimit("parallel@example.test", 4, 60_000),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 4);
  assert.ok(
    results
      .filter((r) => r.status === "rejected")
      .every((r) => r.reason instanceof ApiError && r.reason.status === 429),
  );
  await query("UPDATE rate_limits SET expires_at = 0");
  await rateLimit("parallel@example.test", 4, 60_000);
});

test("asynchronous failure rolls back awaited writes and pool reopening retains committed history", async () => {
  const id = await account();
  const mission = (await getState(id, NOW)).missions[0];
  await completeMission(id, mission.id, NOW);
  const before = await getState(id, NOW);
  await assert.rejects(
    () =>
      transaction(async (db) => {
        await db
          .prepare("UPDATE users SET name = ? WHERE id = ?")
          .run("Uncommitted", id);
        await Promise.resolve();
        throw new Error("rollback-after-await");
      }),
    /rollback-after-await/,
  );
  await closeDb();
  assert.deepEqual(await getState(id, NOW), before);
  await migrateDatabase();
  await migrateDatabase();
  assert.deepEqual(await getState(id, NOW), before);
  assert.equal((await checkDatabase()).status, "ok");
});

test("Vercel without a database returns a traceable 503, never creates a local fallback", async () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    VERCEL: process.env.VERCEL,
    SYSTEM_DB_PATH: process.env.SYSTEM_DB_PATH,
  };
  const logs: unknown[][] = [];
  mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  await closeDb();
  try {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    process.env.VERCEL = "1";
    process.env.SYSTEM_DB_PATH = "/var/task/data/system.sqlite";
    const response = await systemGet(
      new Request("https://system.example/api/system"),
    );
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.requestId, response.headers.get("x-request-id"));
    assert.match(JSON.stringify(logs), /DATABASE_URL_MISSING/);
    assert.doesNotMatch(
      JSON.stringify(body),
      /var\/task|DATABASE_URL|password/,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await closeDb();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("unreachable database and missing schema are diagnosed without leaking credentials", async () => {
  const saved = process.env.DATABASE_URL;
  const logs: unknown[][] = [];
  mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  await closeDb();
  try {
    process.env.DATABASE_URL =
      "postgresql://secret-user:secret-password@127.0.0.1:1/the_system_test";
    const response = await healthGet(
      new Request("http://localhost/api/health"),
    );
    assert.equal(response.status, 503);
    assert.doesNotMatch(
      JSON.stringify(logs),
      /secret-user|secret-password|postgresql:\/\//,
    );
  } finally {
    await closeDb();
    process.env.DATABASE_URL = saved;
  }
  await query("DROP TABLE schema_migrations"); // Own disposable test schema only.
  const response = await healthGet(new Request("http://localhost/api/health"));
  assert.equal(response.status, 503);
  assert.match(JSON.stringify(logs), /42P01/);
  assert.equal((await query("SELECT * FROM users")).rows.length, 0);
});

test("remote TLS verification cannot be disabled by a provider URL parameter", () => {
  assert.deepEqual(
    connectionConfig("postgresql://user:pass@db.example/db?sslmode=require")
      .ssl,
    { rejectUnauthorized: true },
  );
  assert.throws(
    () =>
      connectionConfig("postgresql://user:pass@db.example/db?sslmode=disable"),
    StorageError,
  );
  assert.throws(
    () =>
      connectionConfig(
        "postgresql://user:pass@db.example/db?sslmode=no-verify",
      ),
    StorageError,
  );
  assert.equal(
    connectionConfig("postgresql://user:pass@localhost/db").ssl,
    false,
  );
});
