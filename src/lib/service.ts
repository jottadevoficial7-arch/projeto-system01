import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, hashPassword, verifyPassword } from "./auth";
import { getDb, transaction, type UserRow } from "./db";
import {
  XP_BY_DIFFICULTY,
  RULES_VERSION,
  getLevel,
  getRank,
  getNextRank,
  awardXp,
  assessDay,
  getDiscipline,
  getStreak,
  type Category,
  type Difficulty,
  type StreakDay,
} from "./progression";

export const TIME_ZONE = "America/Sao_Paulo";
const DAY_MS = 86_400_000;
const categories = [
  "training",
  "knowledge",
  "routine",
  "discipline",
  "wellbeing",
] as const;
const difficulty = ["easy", "medium", "hard"] as const;

export const missionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Dê um nome de pelo menos 3 caracteres à missão.")
      .max(100),
    description: z.string().trim().max(500).default(""),
    category: z.enum(categories),
    difficulty: z.enum(difficulty),
    duration: z.number().int().min(1).max(240),
    frequency: z.enum(["daily", "weekly"]),
    time: z.union([
      z.literal(""),
      z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
    ]),
  })
  .strict();

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome ou apelido.").max(40),
    email: z
      .string()
      .trim()
      .email("Informe um e-mail válido.")
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z
      .string()
      .min(10, "Use uma senha com pelo menos 10 caracteres.")
      .max(128),
  })
  .strict();

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    avatar: z
      .enum(["spark", "flame", "moon", "shield", "leaf", "bolt"])
      .optional(),
    goal: z.string().trim().max(200).optional(),
    dailyMinutes: z.number().int().min(5).max(240).optional(),
  })
  .strict();

export type MissionRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  duration: number;
  frequency: "daily" | "weekly";
  time: string;
  active: number;
  created_at: string;
  deleted_at: string | null;
};
type CompletionRow = {
  id: string;
  user_id: string;
  mission_id: string;
  period_key: string;
  title: string;
  normalized_title: string;
  category: Category;
  difficulty: Difficulty;
  xp: number;
  date: string;
  created_at: string;
};
type AssessmentRow = Omit<StreakDay, "rest"> & {
  rest: number;
  discipline_delta: number;
  rules_version: number;
};

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(
      400,
      result.error.issues[0]?.message || "Revise os dados informados.",
    );
  return result.data;
}

export function dayOf(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function addDays(day: string, amount: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + amount * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}
function normalizeTitle(title: string) {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function userById(id: string): UserRow {
  const user = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as
    UserRow | undefined;
  if (!user) throw new ApiError(401, "Perfil não encontrado. Entre novamente.");
  return user;
}

function userMissions(id: string): MissionRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM missions WHERE user_id = ? ORDER BY time, created_at, id",
    )
    .all(id) as MissionRow[];
}

function userCompletions(id: string): CompletionRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM completions WHERE user_id = ? ORDER BY created_at DESC, id DESC",
    )
    .all(id) as CompletionRow[];
}

function hasCompletion(
  mission: MissionRow,
  date: string,
  completions: CompletionRow[],
) {
  const first = mission.frequency === "weekly" ? weekStart(date) : date;
  return completions.some(
    (c) =>
      c.mission_id === mission.id &&
      c.date <= date &&
      (c.date >= first || c.period_key === `week:${weekStart(date)}`),
  );
}

function assessmentFor(
  date: string,
  missions: MissionRow[],
  completions: CompletionRow[],
  rest: boolean,
): StreakDay {
  const sunday = new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
  const due = missions.filter(
    (m) =>
      dayOf(new Date(m.created_at)) <= date &&
      (!m.deleted_at || dayOf(new Date(m.deleted_at)) > date) &&
      (m.frequency === "daily" || sunday),
  );
  return {
    date,
    scheduled: due.length,
    completed: due.filter((m) => hasCompletion(m, date, completions)).length,
    rest,
  };
}

/** Historical milestones do not disappear when a later day breaks the current streak. */
function bestStreak(days: StreakDay[]): number {
  let current = 0;
  let best = 0;
  let previous: string | null = null;
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (previous !== null && day.date !== addDays(previous, 1)) current = 0;
    const result = assessDay(day);
    if (!result.paused) current = result.qualified ? current + 1 : 0;
    best = Math.max(best, current);
    previous = day.date;
  }
  return best;
}

/** Assess each expired scheduled day once, using the original recorded rule version. */
export function reconcileDays(userId: string, now = new Date()): void {
  const today = dayOf(now);
  const user = userById(userId);
  const yesterday = addDays(today, -1);
  if (user.last_assessed >= yesterday) return;
  transaction((db) => {
    const missions = userMissions(userId);
    const completions = userCompletions(userId);
    const rests = new Set(
      (
        db
          .prepare("SELECT date FROM rest_days WHERE user_id = ?")
          .all(userId) as { date: string }[]
      ).map((r) => r.date),
    );
    let discipline = user.discipline;
    for (
      let date = addDays(user.last_assessed, 1);
      date <= yesterday;
      date = addDays(date, 1)
    ) {
      const existing = db
        .prepare("SELECT 1 FROM day_assessments WHERE user_id = ? AND date = ?")
        .get(userId, date);
      if (existing) continue;
      const day = assessmentFor(date, missions, completions, rests.has(date));
      const after = getDiscipline({ ...day, current: discipline });
      db.prepare(
        `INSERT INTO day_assessments (user_id, date, completed, scheduled, rest, discipline_delta, rules_version)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        userId,
        date,
        day.completed,
        day.scheduled,
        Number(day.rest),
        after - discipline,
        RULES_VERSION,
      );
      discipline = after;
    }
    db.prepare(
      "UPDATE users SET discipline = ?, last_assessed = ? WHERE id = ?",
    ).run(discipline, yesterday, userId);
  });
}

const starterMissions = [
  {
    title: "Prepare o seu dia",
    description: "Escolha três prioridades possíveis e comece com intenção.",
    category: "routine",
    difficulty: "easy",
    duration: 10,
    frequency: "daily",
    time: "07:30",
  },
  {
    title: "Movimente seu corpo",
    description: "Uma caminhada ou atividade adaptada ao seu ritmo.",
    category: "training",
    difficulty: "medium",
    duration: 30,
    frequency: "daily",
    time: "08:00",
  },
  {
    title: "Um capítulo à frente",
    description: "Vinte minutos de leitura, uma nova perspectiva.",
    category: "knowledge",
    difficulty: "medium",
    duration: 20,
    frequency: "daily",
    time: "12:30",
  },
  {
    title: "Entre em modo foco",
    description: "Dedique um bloco de atenção a algo que você quer aprender.",
    category: "knowledge",
    difficulty: "hard",
    duration: 45,
    frequency: "daily",
    time: "15:00",
  },
  {
    title: "Organize seu espaço",
    description: "Um ambiente mais leve para uma mente mais presente.",
    category: "discipline",
    difficulty: "easy",
    duration: 10,
    frequency: "daily",
    time: "18:00",
  },
  {
    title: "Desacelere por você",
    description: "Uma pausa consciente, sem telas e sem cobranças.",
    category: "wellbeing",
    difficulty: "easy",
    duration: 10,
    frequency: "daily",
    time: "21:00",
  },
] as const;

function insertStarterMissions(userId: string, createdAt: string) {
  const statement = getDb().prepare(`INSERT INTO missions
    (id, user_id, title, description, category, difficulty, duration, frequency, time, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const m of starterMissions)
    statement.run(
      randomUUID(),
      userId,
      m.title,
      m.description,
      m.category,
      m.difficulty,
      m.duration,
      m.frequency,
      m.time,
      createdAt,
    );
}

export function register(input: unknown, now = new Date()): string {
  const data = validate(registerSchema, input);
  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(data.email))
    throw new ApiError(
      409,
      "Já existe uma conta com este e-mail. Tente entrar.",
    );
  const credentials = hashPassword(data.password);
  const id = randomUUID();
  transaction(() => {
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, password_salt, created_at, last_assessed)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.name,
      data.email,
      credentials.hash,
      credentials.salt,
      now.toISOString(),
      addDays(dayOf(now), -1),
    );
    insertStarterMissions(id, now.toISOString());
  });
  return id;
}

export function login(input: unknown): string {
  const data = validate(registerSchema.omit({ name: true }), input);
  const user = getDb()
    .prepare("SELECT * FROM users WHERE email = ? AND is_demo = 0")
    .get(data.email) as UserRow | undefined;
  // Keep an expensive password operation even when the account does not exist.
  const matches = verifyPassword(
    data.password,
    user?.password_salt || "invalid-account-salt",
    user?.password_hash || "0".repeat(128),
  );
  if (!user || !matches) throw new ApiError(401, "E-mail ou senha incorretos.");
  return user.id;
}

/** Every browser receives its own persisted demo. Demo events never enter a real account. */
export function createDemo(now = new Date()): string {
  const today = dayOf(now);
  const firstDay = addDays(today, -6);
  const createdAt = `${firstDay}T10:00:00.000Z`;
  const id = randomUUID();
  transaction((db) => {
    db.prepare(
      `INSERT INTO users (id, name, is_demo, avatar, goal, created_at, last_assessed)
      VALUES (?, ?, 1, ?, ?, ?, ?)`,
    ).run(
      id,
      "Alex",
      "spark",
      "Pequenos passos. Uma evolução extraordinária.",
      createdAt,
      addDays(firstDay, -1),
    );
    insertStarterMissions(id, createdAt);
    const missions = userMissions(id);
    const insert = db.prepare(`INSERT INTO completions
      (id, user_id, mission_id, period_key, title, normalized_title, category, difficulty, xp, date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let offset = 0; offset <= 6; offset++) {
      const date = addDays(firstDay, offset);
      const count = offset === 6 ? 2 : offset === 0 ? 4 : 5;
      for (const [index, mission] of missions.slice(0, count).entries()) {
        insert.run(
          randomUUID(),
          id,
          mission.id,
          `day:${date}`,
          mission.title,
          normalizeTitle(mission.title),
          mission.category,
          mission.difficulty,
          XP_BY_DIFFICULTY[mission.difficulty],
          date,
          offset === 6
            ? new Date(now.getTime() - (2 - index) * 60_000).toISOString()
            : `${date}T${String(11 + index).padStart(2, "0")}:00:00.000Z`,
        );
      }
    }
  });
  reconcileDays(id, now);
  return id;
}

export function getState(userId: string, now = new Date()) {
  reconcileDays(userId, now);
  const user = userById(userId);
  const today = dayOf(now);
  const allMissions = userMissions(userId);
  const completions = userCompletions(userId);
  const restDates = new Set(
    (
      getDb()
        .prepare("SELECT date FROM rest_days WHERE user_id = ?")
        .all(userId) as { date: string }[]
    ).map((r) => r.date),
  );
  const assessments = getDb()
    .prepare("SELECT * FROM day_assessments WHERE user_id = ? ORDER BY date")
    .all(userId) as AssessmentRow[];
  const streakDays: StreakDay[] = assessments.map((d) => ({
    date: d.date,
    scheduled: d.scheduled,
    completed: d.completed,
    rest: Boolean(d.rest),
  }));
  const currentDay = assessmentFor(
    today,
    allMissions,
    completions,
    restDates.has(today),
  );
  const currentAssessment = assessDay(currentDay);
  // Today's still-open goals cannot break yesterday's streak.
  if (currentAssessment.qualified || currentAssessment.paused)
    streakDays.push(currentDay);
  const totalXp = completions.reduce((sum, c) => sum + c.xp, 0);
  const activeDays = new Set(completions.map((c) => c.date)).size;
  const todayEvents = completions.filter((c) => c.date === today);
  const monday = weekStart(today);
  const history = [
    ...completions.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      xp: c.xp,
      date: c.date,
      createdAt: c.created_at,
      type: "completion" as const,
    })),
    ...assessments
      .filter((d) => d.discipline_delta < 0)
      .map((d) => ({
        id: `assessment:${d.date}`,
        title: `Metas pendentes · ${d.discipline_delta} de disciplina`,
        category: "discipline" as const,
        xp: 0,
        date: d.date,
        createdAt: `${addDays(d.date, 1)}T02:59:59.000Z`,
        type: "penalty" as const,
      })),
    ...[...restDates].map((date) => ({
      id: `rest:${date}`,
      title: "Dia de descanso planejado",
      category: "wellbeing" as const,
      xp: 0,
      date,
      createdAt: `${date}T12:00:00.000Z`,
      type: "rest" as const,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const categoryXp = Object.fromEntries(
    categories.map((category) => [
      category,
      completions
        .filter((c) => c.category === category)
        .reduce((sum, c) => sum + c.xp, 0),
    ]),
  );
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isDemo: Boolean(user.is_demo),
      createdAt: user.created_at,
      avatar: user.avatar,
      goal: user.goal,
      dailyMinutes: user.daily_minutes,
    },
    missions: allMissions
      .filter((m) => m.active)
      .map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        category: m.category,
        difficulty: m.difficulty,
        xp: XP_BY_DIFFICULTY[m.difficulty],
        duration: m.duration,
        frequency: m.frequency,
        time: m.time,
        completed: hasCompletion(m, today, completions),
        active: Boolean(m.active),
        createdAt: m.created_at,
      })),
    history,
    progress: {
      totalXp,
      discipline: user.discipline,
      streak: getStreak(streakDays),
      bestStreak: bestStreak(streakDays),
      activeDays,
      todayXp: todayEvents.reduce((sum, c) => sum + c.xp, 0),
      completedToday: todayEvents.length,
      totalCompleted: completions.length,
      categoryXp,
      level: getLevel(totalXp),
      rank: getRank(totalXp, activeDays),
      nextRank: getNextRank(totalXp, activeDays),
    },
    week: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      const events = completions.filter((c) => c.date === date);
      return {
        date,
        label: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][i],
        xp: events.reduce((sum, c) => sum + c.xp, 0),
        count: events.length,
        rest: restDates.has(date),
      };
    }),
    restToday: restDates.has(today),
    today,
    timeZone: TIME_ZONE,
    rulesVersion: RULES_VERSION,
  };
}

function ownedMission(userId: string, id: string): MissionRow {
  const mission = getDb()
    .prepare(
      "SELECT * FROM missions WHERE id = ? AND user_id = ? AND active = 1",
    )
    .get(id, userId) as MissionRow | undefined;
  if (!mission) throw new ApiError(404, "Missão não encontrada.");
  return mission;
}

export function createMission(
  userId: string,
  input: unknown,
  now = new Date(),
): string {
  const mission = validate(missionSchema, input);
  reconcileDays(userId, now);
  const current = userMissions(userId).filter((m) => m.active);
  if (current.length >= 20)
    throw new ApiError(
      400,
      "Mantenha até 20 missões ativas para uma rotina possível.",
    );
  if (
    current.some(
      (m) => normalizeTitle(m.title) === normalizeTitle(mission.title),
    )
  )
    throw new ApiError(409, "Você já tem uma missão ativa com esse nome.");
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO missions (id, user_id, title, description, category, difficulty, duration, frequency, time, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      mission.title,
      mission.description,
      mission.category,
      mission.difficulty,
      mission.duration,
      mission.frequency,
      mission.time,
      now.toISOString(),
    );
  return id;
}

export function updateMission(
  userId: string,
  id: string,
  input: unknown,
  now = new Date(),
) {
  const patch = validate(missionSchema.partial(), input);
  reconcileDays(userId, now);
  const original = ownedMission(userId, id);
  const mission = { ...original, ...patch };
  if (
    userMissions(userId).some(
      (m) =>
        m.active &&
        m.id !== id &&
        normalizeTitle(m.title) === normalizeTitle(mission.title),
    )
  )
    throw new ApiError(409, "Você já tem uma missão ativa com esse nome.");
  getDb()
    .prepare(
      "UPDATE missions SET title = ?, description = ?, category = ?, difficulty = ?, duration = ?, frequency = ?, time = ? WHERE id = ? AND user_id = ?",
    )
    .run(
      mission.title,
      mission.description,
      mission.category,
      mission.difficulty,
      mission.duration,
      mission.frequency,
      mission.time,
      id,
      userId,
    );
}

export function deleteMission(userId: string, id: string, now = new Date()) {
  reconcileDays(userId, now);
  ownedMission(userId, id);
  getDb()
    .prepare(
      "UPDATE missions SET active = 0, deleted_at = ? WHERE id = ? AND user_id = ?",
    )
    .run(now.toISOString(), id, userId);
}

export function completeMission(userId: string, id: string, now = new Date()) {
  reconcileDays(userId, now);
  const today = dayOf(now);
  return transaction((db) => {
    const mission = ownedMission(userId, id);
    if (
      db
        .prepare("SELECT 1 FROM rest_days WHERE user_id = ? AND date = ?")
        .get(userId, today)
    )
      throw new ApiError(
        409,
        "Hoje é seu dia de descanso. Retome a rotina antes de concluir missões.",
      );
    const completions = userCompletions(userId);
    if (hasCompletion(mission, today, completions))
      return {
        ok: true,
        xpAwarded: 0,
        alreadyCompleted: true,
        levelUp: false,
        rankUp: false,
      };
    if (
      completions.some(
        (c) =>
          c.date === today &&
          c.normalized_title === normalizeTitle(mission.title),
      )
    )
      throw new ApiError(
        409,
        "Uma missão com esse nome já foi registrada hoje.",
      );
    const todayXp = completions
      .filter((c) => c.date === today)
      .reduce((sum, c) => sum + c.xp, 0);
    const totalXp = completions.reduce((sum, c) => sum + c.xp, 0);
    const activeDays = new Set(completions.map((c) => c.date)).size;
    const xpAwarded = awardXp(XP_BY_DIFFICULTY[mission.difficulty], todayXp);
    const nextActiveDays = new Set([...completions.map((c) => c.date), today])
      .size;
    db.prepare(
      `INSERT INTO completions (id, user_id, mission_id, period_key, title, normalized_title, category, difficulty, xp, date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      userId,
      id,
      `${mission.frequency === "weekly" ? "week" : "day"}:${mission.frequency === "weekly" ? weekStart(today) : today}`,
      mission.title,
      normalizeTitle(mission.title),
      mission.category,
      mission.difficulty,
      xpAwarded,
      today,
      now.toISOString(),
    );
    return {
      ok: true,
      xpAwarded,
      alreadyCompleted: false,
      levelUp: getLevel(totalXp + xpAwarded).level > getLevel(totalXp).level,
      rankUp:
        getRank(totalXp + xpAwarded, nextActiveDays).rank !==
        getRank(totalXp, activeDays).rank,
    };
  });
}

export function setRest(userId: string, rest: boolean, now = new Date()) {
  if (typeof rest !== "boolean")
    throw new ApiError(400, "Informe se deseja descansar hoje.");
  reconcileDays(userId, now);
  if (rest)
    getDb()
      .prepare(
        "INSERT OR IGNORE INTO rest_days (user_id, date, created_at) VALUES (?, ?, ?)",
      )
      .run(userId, dayOf(now), now.toISOString());
  else
    getDb()
      .prepare("DELETE FROM rest_days WHERE user_id = ? AND date = ?")
      .run(userId, dayOf(now));
}

export function updateProfile(userId: string, input: unknown) {
  const patch = validate(profileSchema, input);
  const user = userById(userId);
  getDb()
    .prepare(
      "UPDATE users SET name = ?, avatar = ?, goal = ?, daily_minutes = ? WHERE id = ?",
    )
    .run(
      patch.name ?? user.name,
      patch.avatar ?? user.avatar,
      patch.goal ?? user.goal,
      patch.dailyMinutes ?? user.daily_minutes,
      userId,
    );
}

export function exportUserData(userId: string, now = new Date()) {
  const state = getState(userId, now);
  return {
    format: "the-system-export",
    version: 1,
    exportedAt: now.toISOString(),
    ...state,
    missions: userMissions(userId).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      category: m.category,
      difficulty: m.difficulty,
      duration: m.duration,
      frequency: m.frequency,
      time: m.time,
      active: Boolean(m.active),
      createdAt: m.created_at,
      deletedAt: m.deleted_at,
    })),
    completions: userCompletions(userId).map((c) => ({
      id: c.id,
      missionId: c.mission_id,
      title: c.title,
      category: c.category,
      difficulty: c.difficulty,
      xp: c.xp,
      date: c.date,
      createdAt: c.created_at,
    })),
    assessments: getDb()
      .prepare(
        "SELECT date, completed, scheduled, rest, discipline_delta AS disciplineDelta, rules_version AS rulesVersion FROM day_assessments WHERE user_id = ? ORDER BY date",
      )
      .all(userId),
    restDays: getDb()
      .prepare("SELECT date FROM rest_days WHERE user_id = ? ORDER BY date")
      .all(userId),
  };
}
