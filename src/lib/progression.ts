/** Rules version 1. Keep historical awarded XP; changes apply prospectively. */
export const RULES_VERSION = 1;
export const DAILY_XP_CAP = 150;
export const DAILY_COMPLETION_TARGET = 0.8;

export const CATEGORY_LABELS = {
  training: "Treinamento",
  knowledge: "Conhecimento",
  routine: "Rotina",
  discipline: "Disciplina",
  wellbeing: "Bem-estar",
} as const;

export type Category = keyof typeof CATEGORY_LABELS;

export const XP_BY_DIFFICULTY = { easy: 10, medium: 20, hard: 35 } as const;
export type Difficulty = keyof typeof XP_BY_DIFFICULTY;

export const RANKS = [
  { rank: "E", name: "Despertar", minXp: 0, minDays: 0 },
  { rank: "D", name: "Explorador", minXp: 2_000, minDays: 21 },
  { rank: "C", name: "Constante", minXp: 9_000, minDays: 90 },
  { rank: "B", name: "Determinado", minXp: 27_000, minDays: 270 },
  { rank: "A", name: "Extraordinário", minXp: 55_000, minDays: 540 },
  { rank: "S", name: "Transcendente", minXp: 100_000, minDays: 900 },
] as const;

export type Rank = (typeof RANKS)[number];

function nonnegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} deve ser um inteiro não negativo e seguro.`);
  }
  return value;
}

/** XP required to complete one level. Level one starts at zero lifetime XP. */
export function levelCost(level: number): number {
  nonnegativeInteger(level, "level");
  if (level < 1) throw new RangeError("O nível mínimo é 1.");
  const n = level - 1;
  return 100 + 50 * n + 10 * n * n;
}

/** Returns progress as a percentage, never as a 0–1 fraction. */
export function getLevel(totalXp: number): {
  level: number;
  currentXp: number;
  requiredXp: number;
  progress: number;
} {
  nonnegativeInteger(totalXp, "totalXp");
  let level = 1;
  let currentXp = totalXp;
  let requiredXp = levelCost(level);
  while (currentXp >= requiredXp) {
    currentXp -= requiredXp;
    level += 1;
    requiredXp = levelCost(level);
  }
  return {
    level,
    currentXp,
    requiredXp,
    progress: (currentXp / requiredXp) * 100,
  };
}

/** Both lifetime XP and distinct active days are mandatory for promotion. */
export function getRank(totalXp: number, activeDays: number): Rank {
  nonnegativeInteger(totalXp, "totalXp");
  nonnegativeInteger(activeDays, "activeDays");
  let result: Rank = RANKS[0];
  for (const rank of RANKS) {
    if (totalXp >= rank.minXp && activeDays >= rank.minDays) result = rank;
  }
  return result;
}

export function getNextRank(totalXp: number, activeDays: number): Rank | null {
  const current = getRank(totalXp, activeDays);
  return (
    RANKS[RANKS.findIndex((rank) => rank.rank === current.rank) + 1] ?? null
  );
}

/** Awarded inside the same database transaction as the unique completion. */
export function awardXp(baseXp: number, todayXp: number): number {
  nonnegativeInteger(baseXp, "baseXp");
  nonnegativeInteger(todayXp, "todayXp");
  return Math.min(baseXp, Math.max(0, DAILY_XP_CAP - todayXp));
}

export type DayAssessment = {
  completed: number;
  scheduled: number;
  rest?: boolean;
};

function validateAssessment(day: DayAssessment): void {
  nonnegativeInteger(day.completed, "completed");
  nonnegativeInteger(day.scheduled, "scheduled");
  if (day.completed > day.scheduled) {
    throw new RangeError(
      "Conclusões não podem exceder as missões programadas.",
    );
  }
}

/** Only assess an expired day, once. A current unfinished day is not a failure. */
export function assessDay(day: DayAssessment): {
  qualified: boolean;
  paused: boolean;
  disciplineDelta: number;
} {
  validateAssessment(day);
  if (day.rest || day.scheduled === 0) {
    return { qualified: false, paused: true, disciplineDelta: 0 };
  }
  const qualified = day.completed / day.scheduled >= DAILY_COMPLETION_TARGET;
  return {
    qualified,
    paused: false,
    disciplineDelta: qualified
      ? 2
      : -Math.min(3, day.scheduled - day.completed),
  };
}

/** Discipline is independent of XP and remains between zero and one hundred. */
export function getDiscipline(
  day: DayAssessment & { current: number },
): number {
  nonnegativeInteger(day.current, "current");
  if (day.current > 100)
    throw new RangeError("Disciplina não pode exceder 100.");
  return Math.max(
    0,
    Math.min(100, day.current + assessDay(day).disciplineDelta),
  );
}

export type StreakDay = DayAssessment & { date: string };

function dateNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("Data inválida.");
  const milliseconds = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().slice(0, 10) !== date
  ) {
    throw new RangeError("Data inválida.");
  }
  return milliseconds / 86_400_000;
}

/**
 * Count qualifying days in the latest streak. Rest/unscheduled days preserve,
 * but do not increase it. Missing calendar days break the chain: callers must
 * explicitly supply planned rest days. Do not pass today's pending assessment.
 */
export function getStreak(days: readonly StreakDay[]): number {
  const sorted = days
    .map((day) => ({ day, ordinal: dateNumber(day.date) }))
    .sort((a, b) => a.ordinal - b.ordinal);
  let streak = 0;
  let previous: number | null = null;
  for (const { day, ordinal } of sorted) {
    if (previous === ordinal)
      throw new RangeError("Dia duplicado na sequência.");
    if (previous !== null && ordinal !== previous + 1) streak = 0;
    const result = assessDay(day);
    if (!result.paused) streak = result.qualified ? streak + 1 : 0;
    previous = ordinal;
  }
  return streak;
}
