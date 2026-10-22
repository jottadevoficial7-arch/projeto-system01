import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_XP_CAP,
  RANKS,
  XP_BY_DIFFICULTY,
  assessDay,
  awardXp,
  getDiscipline,
  getLevel,
  getNextRank,
  getRank,
  getStreak,
  levelCost,
} from "../src/lib/progression";

test("new profiles begin at level one with zero progress", () => {
  assert.deepEqual(getLevel(0), {
    level: 1,
    currentXp: 0,
    requiredXp: 100,
    progress: 0,
  });
  assert.equal(getRank(0, 0).rank, "E");
});

test("level transitions preserve excess XP and increase the requirement", () => {
  assert.equal(getLevel(99).level, 1);
  assert.deepEqual(getLevel(100), {
    level: 2,
    currentXp: 0,
    requiredXp: 160,
    progress: 0,
  });
  assert.deepEqual(getLevel(180), {
    level: 2,
    currentXp: 80,
    requiredXp: 160,
    progress: 50,
  });
  assert.equal(getLevel(260).level, 3);
  assert.equal(getLevel(260).currentXp, 0);
  assert.ok(levelCost(100) > levelCost(10));
});

test("all reachable level boundaries conserve lifetime XP", () => {
  let spent = 0;
  for (let level = 1; level < 100; level++) {
    const cost = levelCost(level);
    const atStart = getLevel(spent);
    const beforeNext = getLevel(spent + cost - 1);
    assert.equal(atStart.level, level);
    assert.equal(atStart.currentXp, 0);
    assert.equal(beforeNext.level, level);
    assert.equal(beforeNext.currentXp, cost - 1);
    assert.ok(beforeNext.progress >= 0 && beforeNext.progress < 100);
    spent += cost;
  }
});

test("every rank requires both the XP and the distinct-day threshold", () => {
  for (const rank of RANKS.slice(1)) {
    assert.equal(getRank(rank.minXp, rank.minDays).rank, rank.rank);
    assert.notEqual(getRank(rank.minXp - 1, rank.minDays).rank, rank.rank);
    assert.notEqual(getRank(rank.minXp, rank.minDays - 1).rank, rank.rank);
  }
  assert.equal(getRank(1_000_000, 14).rank, "E");
  assert.equal(getRank(1_000_000, 899).rank, "A");
  assert.equal(getNextRank(100_000, 900), null);
  assert.equal(getNextRank(2_000, 20)?.rank, "D");
});

test("daily cap grants only the remaining balance, including zero-XP completions", () => {
  assert.equal(awardXp(XP_BY_DIFFICULTY.medium, 0), 20);
  assert.equal(awardXp(35, 140), 10);
  assert.equal(awardXp(35, DAILY_XP_CAP), 0);
  assert.equal(awardXp(35, 200), 0);
  let total = 0;
  for (let index = 0; index < 100; index++) total += awardXp(35, total);
  assert.equal(total, DAILY_XP_CAP);
});

test("malformed XP cannot silently create or remove progress", () => {
  for (const bad of [
    -1,
    Number.NaN,
    Infinity,
    1.1,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(() => getLevel(bad), RangeError);
    assert.throws(() => getRank(bad, 0), RangeError);
    assert.throws(() => awardXp(bad, 0), RangeError);
    assert.throws(() => awardXp(20, bad), RangeError);
  }
});

test("discipline only changes modestly and stays within bounds", () => {
  assert.equal(getDiscipline({ current: 99, completed: 5, scheduled: 5 }), 100);
  assert.equal(getDiscipline({ current: 1, completed: 0, scheduled: 20 }), 0);
  assert.equal(
    getDiscipline({ current: 100, completed: 0, scheduled: 20 }),
    97,
  );
  assert.equal(getDiscipline({ current: 80, completed: 4, scheduled: 5 }), 82);
  assert.equal(getDiscipline({ current: 80, completed: 1, scheduled: 2 }), 79);
  assert.deepEqual(assessDay({ completed: 0, scheduled: 6, rest: true }), {
    qualified: false,
    paused: true,
    disciplineDelta: 0,
  });
  assert.equal(getDiscipline({ current: 80, completed: 0, scheduled: 0 }), 80);
  assert.throws(() =>
    getDiscipline({ current: 101, completed: 0, scheduled: 0 }),
  );
  assert.throws(() => assessDay({ completed: 3, scheduled: 2 }));
});

test("planned rest preserves streak without counting as activity", () => {
  assert.equal(
    getStreak([
      { date: "2026-01-01", completed: 4, scheduled: 5 },
      { date: "2026-01-02", completed: 0, scheduled: 5, rest: true },
      { date: "2026-01-03", completed: 0, scheduled: 0 },
      { date: "2026-01-04", completed: 5, scheduled: 5 },
    ]),
    2,
  );
});

test("missed targets and unaccounted calendar gaps break the sequence", () => {
  assert.equal(
    getStreak([
      { date: "2026-01-01", completed: 5, scheduled: 5 },
      { date: "2026-01-02", completed: 3, scheduled: 5 },
      { date: "2026-01-03", completed: 5, scheduled: 5 },
    ]),
    1,
  );
  assert.equal(
    getStreak([
      { date: "2026-01-01", completed: 1, scheduled: 1 },
      { date: "2026-01-03", completed: 1, scheduled: 1 },
    ]),
    1,
  );
  assert.equal(getStreak([]), 0);
});

test("streak chronology handles leap days, sorting, invalid and duplicate dates", () => {
  assert.equal(
    getStreak([
      { date: "2024-03-01", completed: 1, scheduled: 1 },
      { date: "2024-02-28", completed: 1, scheduled: 1 },
      { date: "2024-02-29", completed: 1, scheduled: 1 },
    ]),
    3,
  );
  assert.throws(() =>
    getStreak([{ date: "2025-02-29", completed: 1, scheduled: 1 }]),
  );
  assert.throws(() =>
    getStreak([
      { date: "2026-01-01", completed: 1, scheduled: 1 },
      { date: "2026-01-01", completed: 1, scheduled: 1 },
    ]),
  );
});
