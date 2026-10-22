import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { setupTestDatabase } from "./helpers";
import { closeDb, getDb, transaction } from "../src/lib/db";
import {
  ApiError,
  assertSameOrigin,
  createSession,
  findSession,
  rateLimit,
  readBody,
  revokeSession,
  sessionCookie,
} from "../src/lib/auth";
import {
  addDays,
  completeMission,
  createDemo,
  createMission,
  dayOf,
  deleteMission,
  exportUserData,
  getState,
  login,
  register,
  setRest,
  updateMission,
  updateProfile,
} from "../src/lib/service";
import { GET as systemGet } from "../src/app/api/system/route";
import { POST as authPost } from "../src/app/api/auth/route";
import { POST as completePost } from "../src/app/api/missions/[id]/complete/route";
import { POST as missionPost } from "../src/app/api/missions/route";
const NOW = new Date("2026-10-19T15:00:00.000Z"); // Monday, noon in São Paulo.
const ORIGIN = "http://localhost:3000";
let cleanup: () => Promise<void>;
beforeEach(async () => {
  cleanup = await setupTestDatabase();
  delete process.env.COOKIE_SECURE;
  delete process.env.APP_ORIGIN;
});
afterEach(async () => {
  await cleanup?.();
  delete process.env.COOKIE_SECURE;
  delete process.env.APP_ORIGIN;
});
async function account(email = "alex@example.test", now = NOW) {
  return await register(
    { name: "Alex", email, password: "a-test-password-123" },
    now,
  );
}
function mission(
  title = "Estudar português",
  extras: Record<string, unknown> = {},
) {
  return {
    title,
    description: "Prática possível e intencional.",
    category: "knowledge",
    difficulty: "medium",
    duration: 20,
    frequency: "daily",
    time: "12:30",
    ...extras,
  };
}
function request(
  path: string,
  {
    token,
    body,
    method = "POST",
    origin = ORIGIN,
  }: {
    token?: string;
    body?: unknown;
    method?: string;
    origin?: string;
  } = {},
) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(token ? { Cookie: `system_session=${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function status(expected: number) {
  return (error: unknown) =>
    error instanceof ApiError && error.status === expected;
}
test("same-origin checks support Next listen addresses and enforce a configured public origin", () => {
  const local = new Request("http://0.0.0.0:3000/api/auth", {
    method: "POST",
    headers: { Host: "localhost:3000", Origin: ORIGIN },
  });
  assert.doesNotThrow(() => assertSameOrigin(local));
  assert.throws(
    () =>
      assertSameOrigin(
        new Request(local, {
          headers: {
            Host: "localhost:3000",
            Origin: "https://another.example",
          },
        }),
      ),
    status(403),
  );
  process.env.APP_ORIGIN = "https://system.example";
  assert.throws(() => assertSameOrigin(local), status(403));
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request(local, {
        headers: { Host: "internal:3000", Origin: "https://system.example" },
      }),
    ),
  );
});
test("registration starts at zero and credentials survive reopening the persistent database", async () => {
  const id = await account("  ALEX@EXAMPLE.TEST  ");
  const state = await getState(id, NOW);
  assert.equal(state.progress.totalXp, 0);
  assert.equal(state.progress.activeDays, 0);
  assert.equal(state.progress.discipline, 100);
  assert.equal(state.user.isDemo, false);
  assert.equal(state.user.email, "alex@example.test");
  assert.equal(state.missions.length, 6);
  const stored = (await getDb()
    .prepare("SELECT password_hash, password_salt FROM users WHERE id = ?")
    .get(id))!;
  assert.notEqual(stored.password_hash, "a-test-password-123");
  assert.equal(String(stored.password_hash).length, 128);
  assert.ok(stored.password_salt);
  await closeDb();
  assert.equal(
    await login({
      email: "alex@example.test",
      password: "a-test-password-123",
    }),
    id,
  );
  await assert.rejects(
    async () =>
      await login({
        email: "alex@example.test",
        password: "wrong-password-123",
      }),
    status(401),
  );
  await assert.rejects(async () => await account(), status(409));
  await assert.rejects(
    async () =>
      await register({
        name: "Alex",
        email: "other@example.test",
        password: "short",
      }),
    status(400),
  );
});
test("session tokens are hashed, expire, can be revoked, and use secure cookie settings", async () => {
  const id = await account();
  const token = await createSession(id);
  const req = request("/api/system", { token, method: "GET" });
  assert.equal((await findSession(req))?.id, id);
  const stored = (await getDb()
    .prepare("SELECT token_hash FROM sessions")
    .get())!;
  assert.notEqual(stored.token_hash, token);
  assert.match(sessionCookie(req, token), /HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(sessionCookie(req, token), /; Secure/);
  process.env.COOKIE_SECURE = "true";
  assert.match(sessionCookie(req, token), /; Secure/);
  await revokeSession(req);
  assert.equal(await findSession(req), null);
  const expiring = await createSession(id);
  await getDb().prepare("UPDATE sessions SET expires_at = 0").run();
  assert.equal(
    await findSession(
      request("/api/system", { token: expiring, method: "GET" }),
    ),
    null,
  );
});
test("demo sessions are isolated and never seed a real registered account", async () => {
  const one = await systemGet(request("/api/system", { method: "GET" }));
  const two = await systemGet(request("/api/system", { method: "GET" }));
  assert.equal(one.status, 200);
  const a = await one.json();
  const b = await two.json();
  assert.equal(a.user.isDemo, true);
  assert.ok(a.progress.totalXp > 0);
  assert.notEqual(a.user.id, b.user.id);
  assert.match(one.headers.get("set-cookie")!, /HttpOnly/);
  const real = await account();
  assert.equal((await getState(real, NOW)).progress.totalXp, 0);
});
test("completion is idempotent and preserves the exact reward snapshot after edits and archive", async () => {
  const id = await account();
  const task = await createMission(id, mission(), NOW);
  assert.equal((await completeMission(id, task, NOW)).xpAwarded, 20);
  const duplicate = await completeMission(id, task, NOW);
  assert.equal(duplicate.xpAwarded, 0);
  assert.equal(duplicate.alreadyCompleted, true);
  await updateMission(
    id,
    task,
    { title: "Nova descrição da atividade", difficulty: "hard" },
    NOW,
  );
  assert.equal((await completeMission(id, task, NOW)).xpAwarded, 0);
  await deleteMission(id, task, NOW);
  const state = await getState(id, NOW);
  assert.equal(state.progress.totalXp, 20);
  assert.equal(state.history[0].title, "Estudar português");
  assert.equal(state.history[0].xp, 20);
  assert.equal(
    state.missions.some((m) => m.id === task),
    false,
  );
});
test("a transaction caps cumulative daily XP and still records later completed activities", async () => {
  const id = await account();
  const rewards: number[] = [];
  for (let i = 0; i < 8; i++) {
    const task = await createMission(
      id,
      mission(`Atividade ${i}`, { difficulty: "hard" }),
      NOW,
    );
    rewards.push((await completeMission(id, task, NOW)).xpAwarded);
  }
  assert.deepEqual(rewards, [35, 35, 35, 35, 10, 0, 0, 0]);
  const state = await getState(id, NOW);
  assert.equal(state.progress.totalXp, 150);
  assert.equal(state.progress.todayXp, 150);
  assert.equal(state.progress.completedToday, 8);
  const next = new Date("2026-10-20T15:00:00Z");
  assert.equal(
    (await completeMission(id, state.missions[0].id, next)).xpAwarded,
    state.missions[0].xp,
  );
});
test("weekly activities stay completed through Sunday, even after switching to daily", async () => {
  const id = await account();
  const task = await createMission(
    id,
    mission("Meta da semana", { frequency: "weekly" }),
    NOW,
  );
  assert.equal((await completeMission(id, task, NOW)).xpAwarded, 20);
  await updateMission(id, task, { frequency: "daily" }, NOW);
  const tuesday = new Date("2026-10-20T15:00:00Z");
  assert.equal((await completeMission(id, task, tuesday)).xpAwarded, 0);
  assert.equal(
    (await getState(id, tuesday)).missions.find((m) => m.id === task)
      ?.completed,
    true,
  );
  const nextMonday = new Date("2026-10-26T15:00:00Z");
  assert.equal((await completeMission(id, task, nextMonday)).xpAwarded, 20);
});
test("ownership is checked on completion, editing, and archival", async () => {
  const a = await account();
  const b = await account("other@example.test");
  const task = await createMission(a, mission(), NOW);
  await assert.rejects(
    async () => await completeMission(b, task, NOW),
    status(404),
  );
  await assert.rejects(
    async () => await updateMission(b, task, { title: "Intrusão" }, NOW),
    status(404),
  );
  await assert.rejects(
    async () => await deleteMission(b, task, NOW),
    status(404),
  );
  assert.equal((await getState(a, NOW)).progress.totalXp, 0);
  assert.equal((await getState(b, NOW)).history.length, 0);
});
test("duplicate names cannot farm XP by archiving and recreating the same daily activity", async () => {
  const id = await account();
  const task = await createMission(id, mission("Ler   um capítulo"), NOW);
  await assert.rejects(
    async () => await createMission(id, mission("  LER um capítulo "), NOW),
    status(409),
  );
  await completeMission(id, task, NOW);
  await deleteMission(id, task, NOW);
  const replacement = await createMission(id, mission("ler um capítulo"), NOW);
  await assert.rejects(
    async () => await completeMission(id, replacement, NOW),
    status(409),
  );
  assert.equal((await getState(id, NOW)).progress.totalXp, 20);
});
test("expired days are assessed once, today stays open, and XP is never reduced by discipline", async () => {
  const id = await account();
  const initial = await getState(id, NOW);
  await completeMission(id, initial.missions[0].id, NOW);
  assert.equal((await getState(id, NOW)).progress.discipline, 100);
  const tomorrow = new Date("2026-10-20T15:00:00Z");
  assert.equal((await getState(id, tomorrow)).progress.discipline, 97);
  assert.equal((await getState(id, tomorrow)).progress.discipline, 97);
  assert.equal(
    (await getState(id, tomorrow)).progress.totalXp,
    initial.missions[0].xp,
  );
  assert.equal(
    (
      await getDb()
        .prepare(
          "SELECT COUNT(*)::int AS count FROM day_assessments WHERE user_id = ?",
        )
        .get(id)
    )?.count,
    1,
  );
  assert.equal(
    (await getState(id, tomorrow)).history.filter((h) => h.type === "penalty")
      .length,
    1,
  );
});
test("planned rest protects discipline and streak, prevents completion, and can be resumed", async () => {
  const id = await account();
  const missions = (await getState(id, NOW)).missions;
  for (const m of missions) await completeMission(id, m.id, NOW);
  assert.equal((await getState(id, NOW)).progress.streak, 1);
  const tomorrow = new Date("2026-10-20T15:00:00Z");
  await setRest(id, true, tomorrow);
  assert.equal((await getState(id, tomorrow)).progress.streak, 1);
  await assert.rejects(
    async () => await completeMission(id, missions[0].id, tomorrow),
    status(409),
  );
  const afterRest = new Date("2026-10-21T15:00:00Z");
  const state = await getState(id, afterRest);
  assert.equal(state.progress.streak, 1);
  assert.equal(state.progress.discipline, 100);
  await setRest(id, true, afterRest);
  await setRest(id, false, afterRest);
  assert.equal(
    (await completeMission(id, missions[0].id, afterRest)).xpAwarded,
    missions[0].xp,
  );
});
test("historical best streak remains unlocked after a later missed day", async () => {
  const id = await account();
  const missions = (await getState(id, NOW)).missions;
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(`${addDays(dayOf(NOW), offset)}T15:00:00Z`);
    for (const mission of missions) await completeMission(id, mission.id, date);
  }
  const atSeven = await getState(id, new Date("2026-10-25T15:00:00Z"));
  assert.equal(atSeven.progress.streak, 7);
  assert.equal(atSeven.progress.bestStreak, 7);
  const afterMissedDay = await getState(id, new Date("2026-10-27T15:00:00Z"));
  assert.equal(afterMissedDay.progress.streak, 0);
  assert.equal(afterMissedDay.progress.bestStreak, 7);
});
test("weekly missions are due on Sunday, not on earlier weekdays", async () => {
  const id = await account();
  for (const m of (await getState(id, NOW)).missions)
    await deleteMission(id, m.id, NOW);
  await createMission(
    id,
    mission("Concluir meta semanal", { frequency: "weekly" }),
    NOW,
  );
  const saturday = new Date("2026-10-24T15:00:00Z");
  assert.equal((await getState(id, saturday)).progress.discipline, 100);
  const nextMonday = new Date("2026-10-26T15:00:00Z");
  assert.equal((await getState(id, nextMonday)).progress.discipline, 99);
});
test("calendar dates follow São Paulo at UTC midnight and limits reset at local midnight", async () => {
  const late = new Date("2026-10-20T01:30:00Z"); // Oct 19, 22:30 in São Paulo.
  assert.equal(dayOf(late), "2026-10-19");
  const id = await account();
  const task = await createMission(id, mission(), NOW);
  await completeMission(id, task, late);
  assert.equal((await getState(id, late)).history[0].date, "2026-10-19");
  assert.equal(
    (await completeMission(id, task, new Date("2026-10-20T02:59:00Z")))
      .xpAwarded,
    0,
  );
  assert.equal(
    (await completeMission(id, task, new Date("2026-10-20T03:01:00Z")))
      .xpAwarded,
    20,
  );
});
test("export includes archived missions and full history while excluding authentication data", async () => {
  const id = await createDemo(NOW);
  const first = (await getState(id, NOW)).missions[0];
  await deleteMission(id, first.id, NOW);
  await updateProfile(id, {
    name: "Minha identidade",
    avatar: "moon",
    goal: "Evoluir no meu ritmo",
    dailyMinutes: 5,
  });
  const data = await exportUserData(id, NOW);
  assert.equal(data.user.name, "Minha identidade");
  assert.equal(data.user.avatar, "moon");
  assert.ok(data.missions.find((m) => m.id === first.id && !m.active));
  assert.ok(data.completions.length > 0);
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /password_hash|password_salt|token_hash/);
});
test("history remains complete after one hundred events for correct achievements and calendar", async () => {
  const id = await account();
  const missions = (await getState(id, NOW)).missions;
  for (let offset = 0; offset < 20; offset++) {
    const date = new Date(`${addDays(dayOf(NOW), offset)}T15:00:00Z`);
    for (const m of missions) await completeMission(id, m.id, date);
  }
  const state = await getState(id, new Date("2026-11-07T15:00:00Z"));
  assert.equal(
    state.history.filter((h) => h.type === "completion").length,
    120,
  );
  assert.equal(state.progress.totalCompleted, 120);
});
test("failed PostgreSQL transactions roll back completely", async () => {
  const id = await account();
  await assert.rejects(
    async () =>
      await transaction(async (db) => {
        await db
          .prepare("UPDATE users SET name = ? WHERE id = ?")
          .run("Uncommitted", id);
        throw new Error("rollback");
      }),
    /rollback/,
  );
  assert.equal((await getState(id, NOW)).user.name, "Alex");
});
test("API rejects cross-origin mutations, missing sessions, and client-supplied XP", async () => {
  const id = await account();
  const token = await createSession(id);
  const task = (await getState(id, NOW)).missions[0];
  assert.throws(
    () =>
      assertSameOrigin(
        request("/api/auth", { origin: "https://attacker.example" }),
      ),
    status(403),
  );
  const foreign = await completePost(
    request(`/api/missions/${task.id}/complete`, {
      token,
      origin: "https://attacker.example",
    }),
    { params: Promise.resolve({ id: task.id }) },
  );
  assert.equal(foreign.status, 403);
  const unauthenticated = await completePost(
    request(`/api/missions/${task.id}/complete`),
    { params: Promise.resolve({ id: task.id }) },
  );
  assert.equal(unauthenticated.status, 401);
  const manipulated = await missionPost(
    request("/api/missions", {
      token,
      body: { ...mission(), xp: 9999, date: "2099-01-01" },
    }),
  );
  assert.equal(manipulated.status, 400);
  const complete = await completePost(
    request(`/api/missions/${task.id}/complete`, {
      token,
      body: { xp: 9999, date: "2099-01-01" },
    }),
    { params: Promise.resolve({ id: task.id }) },
  );
  assert.equal(complete.status, 200);
  assert.equal((await complete.json()).xpAwarded, task.xp);
  const state = await getState(id);
  assert.equal(state.progress.todayXp, task.xp);
  assert.equal(
    state.history.find((h) => h.type === "completion")?.date,
    dayOf(),
  );
});
test("auth API rotates session on login and logout invalidates it", async () => {
  const id = await account();
  const oldToken = await createSession(id);
  const response = await authPost(
    request("/api/auth", {
      token: oldToken,
      body: {
        action: "login",
        email: "alex@example.test",
        password: "a-test-password-123",
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    await findSession(request("/api/system", { token: oldToken })),
    null,
  );
  const cookie = response.headers.get("set-cookie")!;
  const newToken = cookie.match(/system_session=([a-f0-9]+)/)![1];
  assert.notEqual(oldToken, newToken);
  assert.equal(
    (await findSession(request("/api/system", { token: newToken })))?.id,
    id,
  );
  const logout = await authPost(
    request("/api/auth", { token: newToken, body: { action: "logout" } }),
  );
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(
    await findSession(request("/api/system", { token: newToken })),
    null,
  );
});
test("rate limits and bounded JSON reads reject excessive or malformed input", async () => {
  await rateLimit("test-account", 2, 60000);
  await rateLimit("test-account", 2, 60000);
  await assert.rejects(
    async () => await rateLimit("test-account", 2, 60000),
    status(429),
  );
  await assert.rejects(
    () =>
      readBody(
        new Request(`${ORIGIN}/api/auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{oops",
        }),
      ),
    status(400),
  );
  await assert.rejects(
    () =>
      readBody(request("/api/auth", { body: { content: "a".repeat(20001) } })),
    status(413),
  );
  await assert.rejects(
    () =>
      readBody(
        new Request(`${ORIGIN}/api/auth`, { method: "POST", body: "hello" }),
      ),
    status(415),
  );
});
