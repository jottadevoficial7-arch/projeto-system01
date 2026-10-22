"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Dumbbell,
  Flame,
  Heart,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  DAILY_XP_CAP,
  RANKS,
  XP_BY_DIFFICULTY,
  type Category,
  type Difficulty,
} from "@/lib/progression";

type View =
  | "overview"
  | "missions"
  | "evolution"
  | "calendar"
  | "achievements"
  | "history"
  | "settings";
type Mission = {
  id: string;
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  xp: number;
  duration: number;
  frequency: "daily" | "weekly";
  time: string;
  completed: boolean;
  active: boolean;
  createdAt: string;
};
type History = {
  id: string;
  title: string;
  category: Category;
  xp: number;
  date: string;
  type: "completion" | "rest" | "penalty";
};
type Rank = { rank: string; name: string; minXp: number; minDays: number };
type SystemData = {
  user: {
    id: string;
    name: string;
    email: string;
    isDemo: boolean;
    createdAt: string;
    avatar: string;
    goal: string;
    dailyMinutes: number;
  };
  missions: Mission[];
  history: History[];
  progress: {
    totalXp: number;
    discipline: number;
    streak: number;
    bestStreak: number;
    activeDays: number;
    todayXp: number;
    completedToday: number;
    level: {
      level: number;
      currentXp: number;
      requiredXp: number;
      progress: number;
    };
    rank: Rank;
    nextRank: Rank | null;
  };
  week: {
    date: string;
    label: string;
    xp: number;
    count: number;
    rest: boolean;
  }[];
  restToday: boolean;
};
const CATEGORIES: Record<Category, { icon: LucideIcon; color: string }> = {
  training: { icon: Dumbbell, color: "orange" },
  knowledge: { icon: BookOpen, color: "blue" },
  routine: { icon: Compass, color: "cyan" },
  discipline: { icon: Target, color: "purple" },
  wellbeing: { icon: Heart, color: "green" },
};
const NAV: { id: View; label: string; icon: LucideIcon; short?: string }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "missions", label: "Missões", icon: Target },
  {
    id: "evolution",
    label: "Minha evolução",
    icon: Activity,
    short: "Evolução",
  },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
  { id: "achievements", label: "Conquistas", icon: Trophy },
  { id: "history", label: "Histórico", icon: Clock3 },
];
const DIFFICULTY = { easy: "Leve", medium: "Moderada", hard: "Desafiadora" };
const nf = new Intl.NumberFormat("pt-BR");
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}
function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  return new Date(date.slice(0, 10) + "T12:00:00").toLocaleDateString(
    "pt-BR",
    options,
  );
}
function PlayerIcon({ avatar, size = 20 }: { avatar: string; size?: number }) {
  const Icon =
    (
      { spark: Sparkles, shield: Shield, flame: Flame, moon: Moon } as Record<
        string,
        LucideIcon
      >
    )[avatar] || Sparkles;
  return <Icon size={size} />;
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <svg viewBox="0 0 44 48" aria-hidden="true">
        <path d="M22 2 41 13v22L22 46 3 35V13Z" />
        <path d="M31 15H17l-5 9h20l-5 9H12" />
      </svg>
      {!small && (
        <div>
          THE SYSTEM<span>EVOLUÇÃO SEM LIMITES</span>
        </div>
      )}
    </div>
  );
}
function RankEmblem({
  rank,
  small = false,
}: {
  rank: string;
  small?: boolean;
}) {
  return (
    <div
      className={`rank-emblem ${small ? "mini" : ""}`}
      aria-label={`Rank ${rank}`}
    >
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <defs>
          <linearGradient
            id={small ? "rankMini" : "rankGlow"}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop stopColor="#9ef8ff" />
            <stop offset=".5" stopColor="#45b8d1" />
            <stop offset="1" stopColor="#185574" />
          </linearGradient>
        </defs>
        <circle cx="150" cy="150" r="126" className="orbit" />
        <circle cx="150" cy="150" r="115" className="orbit-dashed" />
        <path d="m150 25 108 62v126l-108 62-108-62V87Z" className="outer-hex" />
        <path d="m150 49 88 51v100l-88 51-88-51V100Z" className="inner-hex" />
        <path d="m150 70 69 40v80l-69 40-69-40v-80Z" className="center-hex" />
        <path
          d="m150 49 0 21M62 100l19 10m157-10-19 10m-69 120v21m-69-61-19 10m157-10 19 10"
          className="hex-detail"
        />
        <path
          d="m150 8 4 7-4 7-4-7Zm0 270 4 7-4 7-4-7ZM8 150l7-4 7 4-7 4Zm270 0 7-4 7 4-7 4Z"
          fill="#6de1f2"
        />
        <path d="M150 89v122M99 120l102 60m0-60-102 60" className="hex-grid" />
      </svg>
      <span className="rank-letter">{rank}</span>
      <span className="rank-caption">RANK ATUAL</span>
    </div>
  );
}
function ProgressBar({
  value,
  className = "",
  label,
}: {
  value: number;
  className?: string;
  label: string;
}) {
  return (
    <div
      className={`progress-track ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
    >
      <div className="modal-heading">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar janela"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function SystemApp() {
  const [data, setData] = useState<SystemData | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState("");
  const [missionModal, setMissionModal] = useState<Mission | "new" | null>(
    null,
  );
  const [authModal, setAuthModal] = useState<"register" | "login" | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [rankModal, setRankModal] = useState(false);
  const [deleteMission, setDeleteMission] = useState<Mission | null>(null);
  const [toast, setToast] = useState<{
    title: string;
    detail: string;
    error?: boolean;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (authModal || missionModal) setToast(null);
  }, [authModal, missionModal]);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error || "Não foi possível abrir o sistema.");
      setData(body);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível conectar. Tente novamente.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    try {
      if (localStorage.getItem("system-reduced-motion") === "true")
        document.documentElement.dataset.reducedMotion = "true";
    } catch {}
  }, []);
  async function mutate(
    path: string,
    method: string,
    body?: unknown,
    key = "save",
  ) {
    setPending(key);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok)
        throw new Error(
          result.error || "Não foi possível salvar. Tente novamente.",
        );
      await load();
      return result;
    } catch (e) {
      setToast({
        title: "Não foi possível concluir",
        detail: e instanceof Error ? e.message : "Tente novamente.",
        error: true,
      });
      return null;
    } finally {
      setPending("");
    }
  }
  function navigate(next: View) {
    setView(next);
    setMobileMenu(false);
    setQuery("");
    setFilter("all");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function complete(m: Mission) {
    const result = await mutate(
      `/api/missions/${m.id}/complete`,
      "POST",
      {},
      m.id,
    );
    if (result)
      setToast({
        title: result.rankUp
          ? "NOVO RANK DESBLOQUEADO"
          : result.levelUp
            ? "LEVEL UP — VOCÊ EVOLUIU"
            : "MISSÃO CONCLUÍDA",
        detail: `+${result.xpAwarded ?? m.xp} XP · ${m.title}`,
      });
  }
  if (!data)
    return (
      <div className="boot-screen">
        <Logo />
        <div className="boot-line" />
        {error ? (
          <>
            <h2>Vamos reconectar seu sistema.</h2>
            <p role="alert">{error}</p>
            <button className="button primary" onClick={load}>
              Tentar novamente <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <p>
              Preparando sua próxima evolução
              <span className="loading-dots">...</span>
            </p>
            <LoaderCircle className="spin" size={22} />
          </>
        )}
      </div>
    );
  const p = data.progress;
  const missions = data.missions.filter((m) => m.active);
  const completed = missions.filter((m) => m.completed).length;
  const filtered = missions.filter(
    (m) =>
      (filter === "all" || filter === m.category) &&
      `${m.title} ${m.description}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  const entries = data.history.filter((h) => h.type === "completion");
  const currentTitle = NAV.find((n) => n.id === view)?.label ?? "Preferências";
  const achievements = [
    {
      name: "O despertar",
      description: "Sua primeira missão concluída.",
      icon: Sparkles,
      current: entries.length,
      target: 1,
      unit: "missão",
    },
    {
      name: "Uma semana de você",
      description: "Mantenha uma sequência de 7 dias.",
      icon: Flame,
      current: p.bestStreak,
      target: 7,
      unit: "dias seguidos",
    },
    {
      name: "Conhecimento é poder",
      description: "Complete 20 missões de conhecimento.",
      icon: BookOpen,
      current: entries.filter((h) => h.category === "knowledge").length,
      target: 20,
      unit: "missões",
    },
    {
      name: "Em movimento",
      description: "Complete 20 missões de treinamento.",
      icon: Dumbbell,
      current: entries.filter((h) => h.category === "training").length,
      target: 20,
      unit: "missões",
    },
    {
      name: "Pequenas grandes vitórias",
      description: "Acumule seus primeiros 500 XP.",
      icon: Zap,
      current: p.totalXp,
      target: 500,
      unit: "XP",
    },
    {
      name: "Além do começo",
      description: "Registre atividades em 30 dias.",
      icon: Compass,
      current: p.activeDays,
      target: 30,
      unit: "dias ativos",
    },
  ];

  function MissionRow({ m, manage = false }: { m: Mission; manage?: boolean }) {
    const meta = CATEGORIES[m.category];
    const Icon = meta.icon;
    return (
      <div className={`mission-row ${m.completed ? "is-done" : ""}`}>
        <button
          className={`mission-check ${m.completed ? "checked" : ""}`}
          disabled={m.completed || !!pending || data!.restToday}
          onClick={() => complete(m)}
          aria-label={
            m.completed ? `${m.title} concluída` : `Concluir ${m.title}`
          }
        >
          {pending === m.id ? (
            <LoaderCircle size={15} className="spin" />
          ) : m.completed ? (
            <Check size={15} />
          ) : null}
        </button>
        <div className={`category-icon ${meta.color}`}>
          <Icon size={19} />
        </div>
        <div className="mission-content">
          <h3>{m.title}</h3>
          <div className="mission-meta">
            <span>{CATEGORY_LABELS[m.category]}</span>
            <i />
            <span>
              <Clock3 size={11} />
              {m.duration} min
            </span>
            {manage && (
              <>
                <i />
                <span>
                  {m.frequency === "weekly" ? "Semanal" : "Diária"}
                  {m.time ? ` · ${m.time}` : ""}
                </span>
              </>
            )}
          </div>
          {manage && m.description && <p>{m.description}</p>}
        </div>
        <span className={`xp-reward ${m.completed ? "earned" : ""}`}>
          {m.completed ? <CheckCheck size={13} /> : <Zap size={13} />}+{m.xp}
          <small>XP</small>
        </span>
        {manage && (
          <button
            className="icon-button"
            onClick={() => setMissionModal(m)}
            aria-label={`Editar ${m.title}`}
          >
            <MoreHorizontal size={19} />
          </button>
        )}
      </div>
    );
  }
  function Filters() {
    return (
      <div className="category-filters" aria-label="Categorias de missões">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          Todas<span>{missions.length}</span>
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "active" : ""}
            onClick={() => setFilter(key as Category)}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }
  function MissionList({ full = false }: { full?: boolean }) {
    return (
      <section className="panel mission-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">UM PASSO DE CADA VEZ</span>
            <h2>
              {full ? "Suas missões" : "Missões de hoje"}
              <span className="count-badge">
                {completed}/{missions.length}
              </span>
            </h2>
          </div>
          <button
            className="button subtle compact"
            onClick={() => setMissionModal("new")}
          >
            <Plus size={15} />
            Nova missão
          </button>
        </div>
        <Filters />
        {data!.restToday && (
          <div className="rest-notice">
            <Moon size={16} />
            Hoje é um dia de descanso. Sua sequência está protegida.
          </div>
        )}
        <div className="mission-list">
          {filtered.length ? (
            (full ? filtered : filtered.slice(0, 5)).map((m) => (
              <MissionRow key={m.id} m={m} manage={full} />
            ))
          ) : (
            <div className="empty-state">
              <Target size={28} />
              <h3>
                {query || filter !== "all"
                  ? "Nenhuma missão encontrada"
                  : "Toda jornada começa com um passo"}
              </h3>
              <p>
                {query || filter !== "all"
                  ? "Experimente outra busca ou categoria."
                  : "Crie uma atividade possível para sua rotina."}
              </p>
              {!query && filter === "all" && (
                <button
                  className="button subtle"
                  onClick={() => setMissionModal("new")}
                >
                  Criar primeira missão
                </button>
              )}
            </div>
          )}
        </div>
        <div className="panel-footer">
          <span>
            <span className="live-dot" />
            {data!.restToday
              ? "DESCANSO TAMBÉM É PROGRESSO"
              : `${missions.length - completed} MISSÕES PARA CONTINUAR EVOLUINDO`}
          </span>
          {!full && (
            <button
              className="text-button"
              onClick={() => navigate("missions")}
            >
              Ver todas
              <ArrowRight size={14} />
            </button>
          )}
          {full && (
            <span className="muted">
              Teto diário: {p.todayXp}/{DAILY_XP_CAP} XP
            </span>
          )}
        </div>
      </section>
    );
  }
  function WeekChart({ full = false }: { full?: boolean }) {
    const max = Math.max(80, ...data!.week.map((d) => d.xp));
    return (
      <section className={`panel week-panel ${full ? "expanded" : ""}`}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">CONSTÂNCIA GERA RESULTADOS</span>
            <h2>Ritmo da semana</h2>
          </div>
          <span className="legend">
            <span />
            XP conquistado
          </span>
        </div>
        <div className="chart-summary">
          <strong>
            {nf.format(data!.week.reduce((sum, d) => sum + d.xp, 0))}
            <span>XP</span>
          </strong>
          <p>
            Cada pequena ação conta.
            <br />
            Continue no seu ritmo.
          </p>
        </div>
        <div className="week-chart">
          {data!.week.map((day) => (
            <button
              key={day.date}
              className={`chart-day ${day.date === today() ? "today" : ""}`}
              onClick={() => {
                setSelectedDate(day.date);
                setMonth(day.date.slice(0, 7));
                navigate("calendar");
              }}
              aria-label={`${dateLabel(day.date)}: ${day.xp} XP`}
            >
              <span className="bar-value">{day.xp}</span>
              <span className="bar-area">
                <span
                  style={{ height: `${Math.max(3, (day.xp / max) * 100)}%` }}
                />
              </span>
              <span className="day-label">
                {day.date === today()
                  ? "Hoje"
                  : dateLabel(day.date, { weekday: "short" }).replace(".", "")}
              </span>
            </button>
          ))}
        </div>
        <div className="chart-baseline" />
      </section>
    );
  }
  function Attributes({ full = false }: { full?: boolean }) {
    const scores = [
      entries.filter((h) => h.category === "training").length,
      entries
        .filter((h) => h.category === "training")
        .reduce((s, h) => s + h.xp, 0) / 10,
      entries.filter((h) => h.category === "knowledge").length,
      p.discipline / 5,
      p.activeDays,
      entries.filter(
        (h) => h.category === "wellbeing" || h.category === "routine",
      ).length,
    ].map(Math.floor);
    const names = [
      "Força",
      "Resistência",
      "Inteligência",
      "Disciplina",
      "Consistência",
      "Mentalidade",
    ];
    const point = (i: number, radius: number) => {
      const a = ((i * 60 - 90) * Math.PI) / 180;
      return `${150 + Math.cos(a) * radius},${137 + Math.sin(a) * radius}`;
    };
    return (
      <section className="panel attributes-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SEU PERFIL EM EVOLUÇÃO</span>
            <h2>Atributos</h2>
          </div>
          <button
            className="icon-button"
            onClick={() =>
              setToast({
                title: "Seus indicadores de engajamento",
                detail:
                  "Os atributos refletem atividades registradas no app. Não medem força, inteligência ou saúde reais.",
              })
            }
            aria-label="Entender os atributos"
          >
            <CircleHelp size={17} />
          </button>
        </div>
        <div className="radar-wrap">
          <svg
            viewBox="0 0 300 282"
            role="img"
            aria-label={names.map((n, i) => `${n}: ${scores[i]}`).join(", ")}
          >
            {[0.25, 0.5, 0.75, 1].map((r) => (
              <polygon
                key={r}
                points={names.map((_, i) => point(i, 93 * r)).join(" ")}
                className="radar-grid"
              />
            ))}
            {names.map((_, i) => (
              <line
                key={i}
                x1="150"
                y1="137"
                x2={point(i, 93).split(",")[0]}
                y2={point(i, 93).split(",")[1]}
                className="radar-axis"
              />
            ))}
            <polygon
              points={scores
                .map((s, i) => point(i, Math.max(4, Math.min(1, s / 30) * 93)))
                .join(" ")}
              className="radar-value"
            />
            {scores.map((s, i) => (
              <circle
                key={i}
                cx={
                  point(i, Math.max(4, Math.min(1, s / 30) * 93)).split(",")[0]
                }
                cy={
                  point(i, Math.max(4, Math.min(1, s / 30) * 93)).split(",")[1]
                }
                r="3"
                fill="#7ae7ee"
              />
            ))}
            {names.map((n, i) => (
              <text
                key={n}
                x={point(i, 119).split(",")[0]}
                y={Number(point(i, 119).split(",")[1]) + 4}
                textAnchor="middle"
                className="radar-label"
              >
                {n}
              </text>
            ))}
          </svg>
        </div>
        {full && (
          <div className="attribute-values">
            {names.map((n, i) => (
              <div key={n}>
                <span>{n}</span>
                <strong>{scores[i]}</strong>
              </div>
            ))}
          </div>
        )}
        <p className="panel-note">
          <span className="live-dot" />
          Indicadores de engajamento nas suas atividades.
        </p>
      </section>
    );
  }
  function HistoryList({ list = data!.history }: { list?: History[] }) {
    return list.length ? (
      <div className="history-list">
        {list.map((h, i) => {
          const Icon =
            h.type === "rest"
              ? Moon
              : h.type === "penalty"
                ? Shield
                : CATEGORIES[h.category]?.icon || Check;
          return (
            <div key={h.id || i} className="history-row">
              <div
                className={`category-icon ${CATEGORIES[h.category]?.color || "cyan"}`}
              >
                <Icon size={18} />
              </div>
              <div>
                <h3>{h.title}</h3>
                <p>
                  {dateLabel(h.date, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {h.type === "completion"
                    ? ` · ${CATEGORY_LABELS[h.category] || "Missão concluída"}`
                    : h.type === "rest"
                      ? " · Descanso planejado"
                      : " · Avaliação do dia"}
                </p>
              </div>
              <span className={h.type === "completion" ? "xp-reward" : "muted"}>
                {h.type === "completion"
                  ? `+${h.xp} XP`
                  : h.type === "rest"
                    ? "Pausa"
                    : "Disciplina"}
              </span>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="empty-state">
        <Clock3 size={28} />
        <h3>Sua história começa agora</h3>
        <p>As atividades concluídas aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      {mobileMenu && (
        <button
          className="sidebar-overlay"
          onClick={() => setMobileMenu(false)}
          aria-label="Fechar menu"
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <button
          className="brand-button"
          onClick={() => navigate("overview")}
          aria-label="THE SYSTEM início"
        >
          <Logo />
        </button>
        <div className="system-state">
          <span className="live-dot" />
          SISTEMA ONLINE<span className="version">V.01</span>
        </div>
        <span className="nav-label">SEU UNIVERSO</span>
        <nav aria-label="Navegação principal">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => navigate(n.id)}
              aria-current={view === n.id ? "page" : undefined}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "missions" && (
                <span className="nav-count">{missions.length - completed}</span>
              )}
              {view === n.id && <span className="nav-active-mark" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-quote">
            <Sparkles size={19} />
            <p>
              Você não precisa ser
              <br />
              perfeito. Só precisa
              <br />
              <strong>continuar.</strong>
            </p>
            <span>UM DIA DE CADA VEZ.</span>
          </div>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            Preferências
          </button>
          <button
            className="sidebar-profile"
            onClick={() =>
              data.user.isDemo ? setAuthModal("register") : navigate("settings")
            }
          >
            <div className="avatar">
              <PlayerIcon avatar={data.user.avatar} size={18} />
            </div>
            <div>
              <strong>{data.user.name}</strong>
              <span>
                {data.user.isDemo ? "Explorando o sistema" : p.rank.name}
              </span>
            </div>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-toggle"
              onClick={() => setMobileMenu(true)}
              aria-label="Abrir menu"
            >
              <Menu size={21} />
            </button>
            <span className="topbar-label">CENTRAL DE EVOLUÇÃO</span>
            <span className="header-divider" />
            <span className="header-location">{currentTitle}</span>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="Buscar missões"
                placeholder="Buscar missões..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setView("missions");
                }}
              />
              <kbd>⌘ K</kbd>
            </div>
            <div className="notification-anchor">
              <button
                className={`icon-button notification-button ${notifications ? "selected" : ""}`}
                aria-label="Ver notificações"
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
                {data.history.length > 0 && <i />}
              </button>
              {notifications && (
                <div className="notification-popover">
                  <div className="popover-heading">
                    <h3>Registro do sistema</h3>
                    <button
                      className="icon-button"
                      onClick={() => setNotifications(false)}
                      aria-label="Fechar notificações"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {data.history.slice(0, 3).map((h) => (
                    <div key={h.id}>
                      <span className="live-dot" />
                      <p>
                        {h.title}
                        <small>
                          {dateLabel(h.date)}
                          {h.xp > 0 ? ` · +${h.xp} XP` : ""}
                        </small>
                      </p>
                    </div>
                  ))}
                  {!data.history.length && (
                    <p>Suas próximas conquistas aparecerão aqui.</p>
                  )}
                  <button
                    className="text-button"
                    onClick={() => {
                      navigate("history");
                      setNotifications(false);
                    }}
                  >
                    Ver histórico completo
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <span className="header-divider" />
            <button
              className="top-profile"
              onClick={() =>
                data.user.isDemo
                  ? setAuthModal("register")
                  : navigate("settings")
              }
            >
              <div className="avatar small-avatar">
                {data.user.name.slice(0, 1).toUpperCase()}
              </div>
              <span>{data.user.name.split(" ")[0]}</span>
              <ChevronDown size={13} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {error && (
            <div className="rest-notice" role="alert">
              {error}
              <button className="text-button" onClick={load}>
                Reconectar
              </button>
            </div>
          )}
          {data.user.isDemo && (
            <div className="demo-banner">
              <div>
                <Sparkles size={14} />
                <span>
                  Modo demonstração
                  <span className="demo-extra">
                    {" "}
                    · Explore com dados de exemplo. Sua jornada começa do zero.
                  </span>
                </span>
              </div>
              <button onClick={() => setAuthModal("register")}>
                Criar meu sistema
                <ArrowRight size={13} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {view === "overview"
                  ? "BEM-VINDO AO SEU PRÓXIMO NÍVEL"
                  : "THE SYSTEM / SUA JORNADA"}
              </span>
              <h1>
                {currentTitle}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {
                  {
                    overview: "Pequenas ações. Evolução real. Todos os dias.",
                    missions: "Transforme suas intenções em pequenas vitórias.",
                    evolution:
                      "O resultado de cada vez que você decidiu continuar.",
                    calendar:
                      "Encontre espaço para evoluir. E também para descansar.",
                    achievements: "Cada marco conta uma parte da sua história.",
                    history:
                      "Seu esforço deixa uma marca. Acompanhe cada passo.",
                    settings: "Um sistema que acompanha o seu ritmo.",
                  }[view]
                }
              </p>
            </div>
            <div className="page-heading-right">
              <div className="date-chip">
                <CalendarDays size={15} />
                <span>
                  {dateLabel(today(), {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }).replace(/ de /g, " ")}
                </span>
              </div>
              {view === "missions" && (
                <button
                  className="button primary"
                  onClick={() => setMissionModal("new")}
                >
                  <Plus size={16} />
                  Nova missão
                </button>
              )}
            </div>
          </div>
          {view === "overview" && (
            <>
              <div className="hero-grid">
                <section className="hero-panel">
                  <div className="hero-grid-pattern" />
                  <div className="hero-copy">
                    <span className="protocol">
                      <span />
                      PROTOCOLO DE EVOLUÇÃO PESSOAL
                    </span>
                    <h2>
                      Seu próximo nível
                      <br />
                      começa <em>hoje.</em>
                    </h2>
                    <p>
                      O verdadeiro poder está em continuar.
                      <br />
                      Cumpra suas missões e construa sua melhor versão.
                    </p>
                    <div className="hero-actions">
                      <button
                        className="button primary"
                        onClick={() => navigate("missions")}
                      >
                        Continuar jornada
                        <ArrowRight size={16} />
                      </button>
                      <button
                        className="button hero-secondary"
                        onClick={() => navigate("evolution")}
                      >
                        Minha evolução
                      </button>
                    </div>
                    <span className="hero-coordinate">
                      SYS.0{p.level.level} <span>—</span> POTENCIAL EM
                      DESENVOLVIMENTO
                    </span>
                  </div>
                  <div className="hero-art">
                    <span className="art-label art-label-top">
                      IDENTIDADE DESPERTADA
                    </span>
                    <RankEmblem rank={p.rank.rank} />
                    <span className="art-label art-label-bottom">
                      <span className="live-dot" /> {p.rank.name.toUpperCase()}
                    </span>
                    <span className="art-cross cross-one">+</span>
                    <span className="art-cross cross-two">+</span>
                  </div>
                </section>
                <section className="panel player-panel">
                  <div className="player-top">
                    <span className="eyebrow">STATUS DO JOGADOR</span>
                    <span className="rank-pill">RANK {p.rank.rank}</span>
                  </div>
                  <div className="player-identity">
                    <div className="avatar player-avatar">
                      <PlayerIcon avatar={data.user.avatar} size={27} />
                    </div>
                    <div>
                      <h2>{data.user.name}</h2>
                      <p>
                        <Sparkles size={12} />
                        {p.rank.name}
                      </p>
                    </div>
                  </div>
                  <div className="level-status">
                    <div>
                      <span className="eyebrow">NÍVEL ATUAL</span>
                      <strong>{String(p.level.level).padStart(2, "0")}</strong>
                    </div>
                    <div className="level-next">
                      <TrendingUp size={16} />
                      <span>
                        Próximo nível
                        <strong>
                          {nf.format(p.level.requiredXp - p.level.currentXp)} XP
                        </strong>
                      </span>
                    </div>
                  </div>
                  <ProgressBar
                    value={p.level.progress}
                    label="Experiência para o próximo nível"
                  />
                  <div className="xp-label">
                    <span>
                      {nf.format(p.level.currentXp)} /{" "}
                      {nf.format(p.level.requiredXp)} XP
                    </span>
                    <span>{Math.floor(p.level.progress)}%</span>
                  </div>
                  <div className="player-footer">
                    <span>Experiência total</span>
                    <strong>
                      <Zap size={13} />
                      {nf.format(p.totalXp)} XP
                    </strong>
                  </div>
                </section>
              </div>
              <div className="metrics-row">
                <Metric
                  icon={Zap}
                  color="cyan"
                  label="XP CONQUISTADO HOJE"
                  value={`+${p.todayXp}`}
                  suffix="XP"
                  detail={`de ${DAILY_XP_CAP} XP disponíveis`}
                />
                <Metric
                  icon={CheckCheck}
                  color="blue"
                  label="MISSÕES CONCLUÍDAS"
                  value={String(p.completedToday).padStart(2, "0")}
                  suffix="hoje"
                  detail={`${completed} de ${missions.length} concluídas no período`}
                />
                <Metric
                  icon={Flame}
                  color="orange"
                  label="SEQUÊNCIA ATUAL"
                  value={String(p.streak).padStart(2, "0")}
                  suffix="dias"
                  detail="Constância acima de intensidade"
                />
                <Metric
                  icon={Shield}
                  color="purple"
                  label="DISCIPLINA"
                  value={String(p.discipline)}
                  suffix="/ 100"
                  detail="Construa um compromisso com você"
                />
              </div>
              <div className="content-grid">
                <MissionList />
                <Attributes />
              </div>
              <div className="content-grid bottom-grid">
                <WeekChart />
                <section className="panel next-rank-panel">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">O PRÓXIMO CAPÍTULO</span>
                      <h2>Além do seu rank</h2>
                    </div>
                    <Shield size={19} />
                  </div>
                  <div className="next-rank-content">
                    <div className="next-rank-letter">
                      {p.nextRank?.rank ?? "S"}
                    </div>
                    <div>
                      <span className="eyebrow">
                        {p.nextRank ? "PRÓXIMO RANK" : "RANK MÁXIMO"}
                      </span>
                      <h3>{p.nextRank?.name ?? "Transcendente"}</h3>
                      <p>
                        Experiência e constância.
                        <br />
                        Uma conquista de verdade.
                      </p>
                    </div>
                  </div>
                  <ProgressBar
                    value={
                      p.nextRank
                        ? Math.min(
                            p.totalXp / p.nextRank.minXp,
                            p.activeDays / p.nextRank.minDays,
                          ) * 100
                        : 100
                    }
                    label="Progresso para próximo rank"
                  />
                  <div className="rank-requirements">
                    <span>
                      {nf.format(p.totalXp)} /{" "}
                      {nf.format(p.nextRank?.minXp ?? p.totalXp)} XP
                    </span>
                    <span>
                      {p.activeDays} / {p.nextRank?.minDays ?? p.activeDays}{" "}
                      dias ativos
                    </span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setRankModal(true)}
                  >
                    Conhecer os requisitos
                    <ArrowRight size={14} />
                  </button>
                </section>
              </div>
            </>
          )}
          {view === "missions" && (
            <>
              <div className="mission-summary">
                <div>
                  <Target size={21} />
                  <span>
                    <strong>{missions.length - completed}</strong> missões
                    disponíveis
                  </span>
                  <span className="summary-divider" />
                  <span>
                    <strong>{completed}</strong> concluídas no período
                  </span>
                </div>
                <button
                  className={`button subtle ${data.restToday ? "rest-active" : ""}`}
                  disabled={!!pending}
                  onClick={async () => {
                    const result = await mutate(
                      "/api/rest",
                      "POST",
                      { rest: !data.restToday },
                      "rest",
                    );
                    if (result)
                      setToast({
                        title: data.restToday
                          ? "Jornada retomada"
                          : "Descanso registrado",
                        detail: data.restToday
                          ? "Suas missões estão disponíveis novamente."
                          : "Cuide de você. Sua sequência estará protegida hoje.",
                      });
                  }}
                >
                  <Moon size={16} />
                  {data.restToday
                    ? "Retomar atividades"
                    : "Planejar descanso hoje"}
                </button>
              </div>
              <MissionList full />
              <div className="gentle-note">
                <Heart size={18} />
                <p>
                  Seu ritmo é o ritmo certo. Adapte suas atividades à sua
                  realidade. Descansar também faz parte da jornada.
                </p>
              </div>
            </>
          )}
          {view === "evolution" && (
            <>
              <div className="metrics-row">
                <Metric
                  icon={Zap}
                  color="cyan"
                  label="EXPERIÊNCIA TOTAL"
                  value={nf.format(p.totalXp)}
                  suffix="XP"
                  detail="Cada ponto foi conquistado"
                />
                <Metric
                  icon={TrendingUp}
                  color="blue"
                  label="NÍVEL ATUAL"
                  value={String(p.level.level).padStart(2, "0")}
                  suffix=""
                  detail={`${p.level.requiredXp - p.level.currentXp} XP até o próximo nível`}
                />
                <Metric
                  icon={Flame}
                  color="orange"
                  label="DIAS ATIVOS"
                  value={String(p.activeDays)}
                  suffix="dias"
                  detail="Dias com atividades registradas"
                />
                <Metric
                  icon={Trophy}
                  color="purple"
                  label="MARCOS ALCANÇADOS"
                  value={String(
                    achievements.filter((a) => a.current >= a.target).length,
                  )}
                  suffix={`/ ${achievements.length}`}
                  detail="A história que você está construindo"
                />
              </div>
              <div className="content-grid">
                <WeekChart full />
                <Attributes full />
              </div>
              <section className="panel ranks-overview">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      PROGRESSO QUE RESPEITA O TEMPO
                    </span>
                    <h2>Uma jornada. Seis ranks.</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setRankModal(true)}
                  >
                    Como funciona
                    <CircleHelp size={15} />
                  </button>
                </div>
                <div className="rank-roadmap">
                  {RANKS.map((r) => (
                    <div
                      key={r.rank}
                      className={`roadmap-step ${p.rank.rank === r.rank ? "current" : ""} ${p.totalXp >= r.minXp && p.activeDays >= r.minDays ? "unlocked" : ""}`}
                    >
                      <div className="roadmap-gem">{r.rank}</div>
                      <h3>{r.name}</h3>
                      <span>{nf.format(r.minXp)} XP</span>
                      <small>{r.minDays} dias ativos</small>
                      {p.rank.rank === r.rank && <b>VOCÊ ESTÁ AQUI</b>}
                    </div>
                  ))}
                </div>
                <p className="panel-note">
                  Os dois requisitos precisam ser cumpridos. O rank S exige pelo
                  menos 900 dias ativos — sua evolução é uma jornada, não uma
                  corrida.
                </p>
              </section>
            </>
          )}
          {view === "achievements" && (
            <>
              <div className="achievement-intro">
                <Trophy size={28} />
                <div>
                  <strong>
                    {achievements.filter((a) => a.current >= a.target).length}{" "}
                    de {achievements.length} marcos alcançados
                  </strong>
                  <p>Marcos de uma jornada que é só sua.</p>
                </div>
                <span>CONTINUE EVOLUINDO</span>
              </div>
              <div className="achievement-grid">
                {achievements.map((a) => (
                  <section
                    key={a.name}
                    className={`panel achievement-card ${a.current >= a.target ? "unlocked" : "locked"}`}
                  >
                    <div className="achievement-icon">
                      <a.icon size={30} />
                    </div>
                    <span className="achievement-status">
                      {a.current >= a.target ? (
                        <>
                          <Check size={12} />
                          ALCANÇADO
                        </>
                      ) : (
                        "EM PROGRESSO"
                      )}
                    </span>
                    <h2>{a.name}</h2>
                    <p>{a.description}</p>
                    <ProgressBar
                      value={(a.current / a.target) * 100}
                      label={`Progresso: ${a.name}`}
                    />
                    <span className="achievement-progress">
                      {Math.min(a.current, a.target)} / {a.target} {a.unit}
                    </span>
                  </section>
                ))}
              </div>
            </>
          )}
          {view === "history" && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">REGISTROS DA SUA JORNADA</span>
                  <h2>
                    Histórico de atividades
                    <span className="count-badge">{data.history.length}</span>
                  </h2>
                </div>
                <a
                  className="button subtle compact"
                  href="/api/export"
                  download
                >
                  <ArrowDownToLine size={15} />
                  Exportar dados
                </a>
              </div>
              <HistoryList />
            </section>
          )}
          {view === "calendar" && (
            <div className="calendar-layout">
              <section className="panel calendar-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">ESPAÇO PARA O QUE IMPORTA</span>
                    <h2 className="capitalize">
                      {dateLabel(month + "-01", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                  </div>
                  <div className="calendar-navigation">
                    <button
                      className="icon-button"
                      aria-label="Mês anterior"
                      onClick={() => setMonth(shiftMonth(month, -1))}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      className="button subtle compact"
                      onClick={() => {
                        setMonth(today().slice(0, 7));
                        setSelectedDate(today());
                      }}
                    >
                      Hoje
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Próximo mês"
                      onClick={() => setMonth(shiftMonth(month, 1))}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                <div className="calendar-grid">
                  {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map(
                    (d) => (
                      <span key={d} className="calendar-weekday">
                        {d}
                      </span>
                    ),
                  )}
                  {calendarDays(month).map((d, i) =>
                    d ? (
                      <button
                        key={d}
                        className={`calendar-day ${d === today() ? "is-today" : ""} ${d === selectedDate ? "selected" : ""}`}
                        onClick={() => setSelectedDate(d)}
                        aria-label={dateLabel(d)}
                        aria-pressed={d === selectedDate}
                      >
                        <span>{Number(d.slice(-2))}</span>
                        <div className="calendar-dots">
                          {entries.some((h) => h.date.slice(0, 10) === d) && (
                            <i />
                          )}
                          {data.history.some(
                            (h) =>
                              h.type === "rest" && h.date.slice(0, 10) === d,
                          ) && <Moon size={11} />}
                        </div>
                      </button>
                    ) : (
                      <div key={`empty-${i}`} />
                    ),
                  )}
                </div>
                <div className="calendar-legend">
                  <span>
                    <i />
                    Atividade registrada
                  </span>
                  <span>
                    <Moon size={12} />
                    Descanso
                  </span>
                </div>
              </section>
              <section className="panel day-detail">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">SEU DIA, SEU RITMO</span>
                    <h2>{dateLabel(selectedDate)}</h2>
                  </div>
                  <CalendarDays size={18} />
                </div>
                <HistoryList
                  list={data.history.filter(
                    (h) => h.date.slice(0, 10) === selectedDate,
                  )}
                />
                {selectedDate >= today() && (
                  <div className="scheduled-list">
                    <span className="eyebrow">
                      ROTINA {selectedDate === today() ? "DE HOJE" : "PREVISTA"}
                    </span>
                    {missions.map((m) => (
                      <div key={m.id}>
                        <span>{m.time || "Livre"}</span>
                        <p>
                          {m.title}
                          <small>
                            {m.frequency === "weekly"
                              ? "Meta semanal"
                              : "Todos os dias"}
                          </small>
                        </p>
                      </div>
                    ))}
                    {!missions.length && (
                      <p className="muted">
                        Crie missões para montar sua rotina.
                      </p>
                    )}
                  </div>
                )}
                {selectedDate === today() && (
                  <button
                    className="button subtle full-width"
                    onClick={() => navigate("missions")}
                  >
                    Ir para minhas missões
                    <ArrowRight size={15} />
                  </button>
                )}
              </section>
            </div>
          )}
          {view === "settings" && (
            <SettingsView
              data={data}
              pending={!!pending}
              mutate={mutate}
              onAuth={() => setAuthModal("register")}
              onToast={setToast}
            />
          )}
          <footer className="app-footer">
            <span>
              <Logo small />
              THE SYSTEM<span className="footer-divider">/</span>EVOLUA NO SEU
              RITMO.
            </span>
            <span>
              FEITO PARA A SUA VIDA REAL
              <span className="live-dot" />
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Navegação rápida">
        {NAV.slice(0, 5).map((n) => (
          <button
            key={n.id}
            className={view === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
            aria-label={n.label}
          >
            <n.icon size={20} />
            <span>{n.short || n.label}</span>
          </button>
        ))}
      </nav>
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && (
          <div className={`system-toast ${toast.error ? "error" : ""}`}>
            <div className="toast-icon">
              {toast.error ? <X size={22} /> : <CheckCheck size={23} />}
            </div>
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.detail}</p>
            </div>
            <button
              className="icon-button"
              aria-label="Fechar notificação"
              onClick={() => setToast(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
      {missionModal && (
        <MissionDialog
          error={toast?.error ? toast.detail : undefined}
          mission={missionModal}
          pending={!!pending}
          onClose={() => setMissionModal(null)}
          onDelete={(m) => {
            setMissionModal(null);
            setDeleteMission(m);
          }}
          onSave={async (fields) => {
            const result = await mutate(
              missionModal === "new"
                ? "/api/missions"
                : `/api/missions/${missionModal.id}`,
              missionModal === "new" ? "POST" : "PATCH",
              fields,
            );
            if (result) {
              setMissionModal(null);
              setToast({
                title:
                  missionModal === "new"
                    ? "Nova missão ativada"
                    : "Missão atualizada",
                detail: "Um passo possível para a sua próxima evolução.",
              });
            }
          }}
        />
      )}
      {deleteMission && (
        <Modal
          title="Arquivar esta missão?"
          eyebrow="AJUSTE SUA JORNADA"
          onClose={() => setDeleteMission(null)}
        >
          <p className="modal-description">
            “{deleteMission.title}” sairá da sua rotina. O histórico e o XP já
            conquistados serão preservados.
          </p>
          <div className="modal-actions">
            <button
              className="button subtle"
              onClick={() => setDeleteMission(null)}
            >
              Manter missão
            </button>
            <button
              className="button danger"
              disabled={!!pending}
              onClick={async () => {
                const result = await mutate(
                  `/api/missions/${deleteMission.id}`,
                  "DELETE",
                );
                if (result) {
                  setDeleteMission(null);
                  setToast({
                    title: "Missão arquivada",
                    detail:
                      "Sua rotina foi atualizada. O progresso continua com você.",
                  });
                }
              }}
            >
              Arquivar missão
            </button>
          </div>
        </Modal>
      )}
      {authModal && (
        <AuthDialog
          error={toast?.error ? toast.detail : undefined}
          mode={authModal}
          pending={!!pending}
          onMode={setAuthModal}
          onClose={() => setAuthModal(null)}
          onSubmit={async (fields) => {
            const result = await mutate(
              "/api/auth",
              "POST",
              { action: authModal, ...fields },
              "auth",
            );
            if (result) {
              setAuthModal(null);
              navigate("overview");
              setToast({
                title:
                  authModal === "register"
                    ? "SEU SISTEMA FOI DESPERTADO"
                    : "BEM-VINDO DE VOLTA",
                detail:
                  authModal === "register"
                    ? "Sua jornada começa agora. Adapte as missões ao seu ritmo."
                    : "Cada novo dia é uma oportunidade de evoluir.",
              });
            }
          }}
        />
      )}
      {rankModal && (
        <Modal
          title="Seu esforço tem um caminho."
          eyebrow="PROTOCOLO DE PROGRESSÃO / V.01"
          onClose={() => setRankModal(false)}
          wide
        >
          <p className="modal-description">
            Cada promoção combina XP acumulado e dias com atividades concluídas.
            Os dois requisitos são necessários. Até {DAILY_XP_CAP} XP podem ser
            conquistados por dia.
          </p>
          <div className="rank-table">
            <div className="rank-table-head">
              <span>RANK</span>
              <span>EXPERIÊNCIA</span>
              <span>DIAS ATIVOS</span>
            </div>
            {RANKS.map((r) => (
              <div
                key={r.rank}
                className={r.rank === p.rank.rank ? "current" : ""}
              >
                <span>
                  <b>{r.rank}</b>
                  {r.name}
                </span>
                <strong>{nf.format(r.minXp)} XP</strong>
                <span>{r.minDays} dias</span>
              </div>
            ))}
          </div>
          <div className="gentle-note">
            <Shield size={19} />
            <p>
              Um dia difícil nunca apaga seu XP. Ao final do dia, cumprir 80%
              das missões rende +2 de disciplina; pendências reduzem no máximo 3
              pontos. Descansos planejados protegem a sequência.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  color,
  label,
  value,
  suffix,
  detail,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  suffix: string;
  detail: string;
}) {
  return (
    <div className="metric">
      <div className={`metric-icon ${color}`}>
        <Icon size={19} />
      </div>
      <div className="metric-body">
        <span className="metric-label">{label}</span>
        <div className="metric-value">
          {value}
          <span>{suffix}</span>
        </div>
        <p>{detail}</p>
      </div>
    </div>
  );
}
function shiftMonth(month: string, delta: number) {
  const d = new Date(month + "-01T12:00:00");
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function calendarDays(month: string) {
  const [year, m] = month.split("-").map(Number);
  const start = new Date(year, m - 1, 1).getDay();
  const length = new Date(year, m, 0).getDate();
  return [
    ...Array(start).fill(null),
    ...Array.from(
      { length },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  ] as (string | null)[];
}

function MissionDialog({
  mission,
  pending,
  onClose,
  onSave,
  onDelete,
  error,
}: {
  error?: string;
  mission: Mission | "new";
  pending: boolean;
  onClose: () => void;
  onSave: (fields: unknown) => Promise<void>;
  onDelete: (m: Mission) => void;
}) {
  const m = mission === "new" ? null : mission;
  const [difficulty, setDifficulty] = useState<Difficulty>(
    m?.difficulty || "medium",
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await onSave({
      title: f.get("title"),
      description: f.get("description"),
      category: f.get("category"),
      difficulty,
      duration: Number(f.get("duration")),
      frequency: f.get("frequency"),
      time: f.get("time"),
    });
  }
  return (
    <Modal
      title={m ? "Ajuste sua missão" : "Toda evolução começa com uma ação."}
      eyebrow={m ? "EDITAR MISSÃO" : "NOVA MISSÃO"}
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="system-form">
        <label>
          O que você quer realizar?
          <input
            name="title"
            required
            maxLength={100}
            placeholder="Ex.: Ler por 20 minutos"
            defaultValue={m?.title}
            autoFocus
          />
        </label>
        <label>
          Uma orientação para você <span className="optional">(opcional)</span>
          <textarea
            name="description"
            maxLength={500}
            placeholder="Uma pequena ação, possível na sua rotina."
            defaultValue={m?.description}
            rows={2}
          />
        </label>
        <div className="form-grid">
          <label>
            Área de evolução
            <select name="category" defaultValue={m?.category || "knowledge"}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Frequência
            <select name="frequency" defaultValue={m?.frequency || "daily"}>
              <option value="daily">Todos os dias</option>
              <option value="weekly">Uma vez por semana</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Duração (minutos)
            <input
              name="duration"
              type="number"
              min={1}
              max={240}
              defaultValue={m?.duration || 20}
              required
            />
          </label>
          <label>
            Horário planejado
            <input name="time" type="time" defaultValue={m?.time || "08:00"} />
          </label>
        </div>
        <fieldset className="difficulty-field">
          <legend>Intensidade da missão</legend>
          <div>
            {Object.entries(DIFFICULTY).map(([key, label]) => (
              <label key={key} className={difficulty === key ? "selected" : ""}>
                <input
                  type="radio"
                  name="difficulty"
                  value={key}
                  checked={difficulty === key}
                  onChange={() => setDifficulty(key as Difficulty)}
                />
                <span>{label}</span>
                <strong>+{XP_BY_DIFFICULTY[key as Difficulty]} XP</strong>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="form-hint">
          <Shield size={14} />
          Uma recompensa por período. Limite diário de {DAILY_XP_CAP} XP.
        </p>
        <div className="modal-actions">
          {m ? (
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => onDelete(m)}
            >
              Arquivar missão
            </button>
          ) : (
            <button type="button" className="button subtle" onClick={onClose}>
              Voltar
            </button>
          )}
          <button className="button primary" disabled={pending}>
            {pending ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Plus size={16} />
            )}{" "}
            {m ? "Salvar alterações" : "Ativar missão"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function AuthDialog({
  mode,
  pending,
  onMode,
  onClose,
  onSubmit,
  error,
}: {
  error?: string;
  mode: "register" | "login";
  pending: boolean;
  onMode: (m: "register" | "login") => void;
  onClose: () => void;
  onSubmit: (f: Record<string, unknown>) => Promise<void>;
}) {
  const register = mode === "register";
  return (
    <Modal
      title={
        register
          ? "Sua jornada merece um começo."
          : "Seu sistema está esperando."
      }
      eyebrow={register ? "DESPERTE SEU POTENCIAL" : "BEM-VINDO DE VOLTA"}
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p className="modal-description">
        {register
          ? "Crie seu perfil e comece do zero, com missões que cabem na sua vida. Seus dados ficam separados da demonstração."
          : "Entre para continuar de onde você parou."}
      </p>
      <form
        className="system-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await onSubmit({
            name: f.get("name") || undefined,
            email: f.get("email"),
            password: f.get("password"),
          });
        }}
      >
        {register && (
          <label>
            Como podemos chamar você?
            <input
              name="name"
              autoComplete="nickname"
              minLength={2}
              maxLength={40}
              required
              placeholder="Seu nome ou apelido"
              autoFocus
            />
          </label>
        )}
        <label>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="voce@exemplo.com"
          />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            minLength={10}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
            required
            placeholder={register ? "Pelo menos 10 caracteres" : "Sua senha"}
          />
        </label>
        {register && (
          <p className="form-hint">
            <Shield size={14} />
            Seu histórico é privado e pode ser exportado a qualquer momento.
          </p>
        )}
        <button className="button primary full-width" disabled={pending}>
          {pending ? <LoaderCircle size={16} className="spin" /> : null}
          {register ? "Iniciar minha jornada" : "Entrar no sistema"}
          <ArrowRight size={16} />
        </button>
        <p className="auth-switch">
          {register ? "Já faz parte do sistema?" : "Ainda não tem um perfil?"}
          <button
            type="button"
            onClick={() => onMode(register ? "login" : "register")}
          >
            {register ? "Entrar na minha conta" : "Criar meu sistema"}
          </button>
        </p>
      </form>
    </Modal>
  );
}
function SettingsView({
  data,
  pending,
  mutate,
  onAuth,
  onToast,
}: {
  data: SystemData;
  pending: boolean;
  mutate: (
    path: string,
    method: string,
    body?: unknown,
    key?: string,
  ) => Promise<Record<string, unknown> | null>;
  onAuth: () => void;
  onToast: (t: { title: string; detail: string }) => void;
}) {
  const [avatar, setAvatar] = useState(data.user.avatar);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(document.documentElement.dataset.reducedMotion === "true");
  }, []);
  const avatars: [string, LucideIcon, string][] = [
    ["spark", Sparkles, "Despertar"],
    ["shield", Shield, "Guardião"],
    ["flame", Flame, "Determinação"],
    ["moon", Moon, "Equilíbrio"],
  ];
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">IDENTIDADE DO JOGADOR</span>
            <h2>Seu perfil</h2>
          </div>
          <Shield size={20} />
        </div>
        <form
          className="system-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const result = await mutate("/api/profile", "PATCH", {
              name: f.get("name"),
              goal: f.get("goal"),
              dailyMinutes: Number(f.get("dailyMinutes")),
              avatar,
            });
            if (result)
              onToast({
                title: "Perfil atualizado",
                detail: "Seu sistema agora está ainda mais com a sua cara.",
              });
          }}
        >
          <fieldset className="avatar-field">
            <legend>Escolha seu emblema</legend>
            <div>
              {avatars.map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  className={avatar === value ? "selected" : ""}
                  aria-label={label}
                  aria-pressed={avatar === value}
                  onClick={() => setAvatar(value)}
                >
                  <Icon size={24} />
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            Nome ou apelido
            <input
              name="name"
              defaultValue={data.user.name}
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          <label>
            Seu objetivo principal
            <input
              name="goal"
              defaultValue={data.user.goal}
              maxLength={200}
              placeholder="Ex.: construir uma rotina mais equilibrada"
            />
          </label>
          <label>
            Tempo disponível por dia (minutos)
            <input
              name="dailyMinutes"
              type="number"
              min={5}
              max={240}
              defaultValue={data.user.dailyMinutes || 30}
              required
            />
          </label>
          <button className="button primary" disabled={pending}>
            Salvar meu perfil
            <Check size={15} />
          </button>
        </form>
      </section>
      <div className="settings-side">
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">DO SEU JEITO</span>
              <h2>Experiência</h2>
            </div>
            <Settings2 size={19} />
          </div>
          <label className="switch-row">
            <span>
              <strong>Reduzir animações</strong>
              <small>Uma experiência visual mais tranquila.</small>
            </span>
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => {
                setReduced(e.target.checked);
                document.documentElement.dataset.reducedMotion = String(
                  e.target.checked,
                );
                try {
                  localStorage.setItem(
                    "system-reduced-motion",
                    String(e.target.checked),
                  );
                } catch {}
              }}
            />
          </label>
          <div className="settings-info">
            <Bell size={17} />
            <p>
              <strong>Notificações no sistema</strong>
              <span>
                Conclusões e evolução aparecem enquanto você usa o aplicativo.
              </span>
            </p>
          </div>
          <p className="panel-note">
            Datas e fechamento diário seguem o horário de Brasília.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SUA JORNADA É SUA</span>
              <h2>Conta e dados</h2>
            </div>
            <ArrowDownToLine size={19} />
          </div>
          <p className="modal-description">
            {data.user.isDemo
              ? "Você está explorando uma demonstração com dados de exemplo. Crie uma conta para começar seu próprio histórico."
              : `Conectado como ${data.user.email}. Seus registros são salvos no servidor.`}
          </p>
          {data.user.isDemo && (
            <button className="button primary full-width" onClick={onAuth}>
              Criar meu sistema
              <ArrowRight size={15} />
            </button>
          )}
          <a href="/api/export" download className="button subtle full-width">
            <ArrowDownToLine size={16} />
            Exportar meus dados (JSON)
          </a>
          {!data.user.isDemo && (
            <button
              className="text-button logout-button"
              disabled={pending}
              onClick={async () => {
                const result = await mutate("/api/auth", "POST", {
                  action: "logout",
                });
                if (result)
                  onToast({
                    title: "Sessão encerrada",
                    detail: "Seu progresso está salvo. Até a próxima evolução.",
                  });
              }}
            >
              <LogOut size={15} />
              Sair da conta
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
