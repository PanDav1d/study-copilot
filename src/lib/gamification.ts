/**
 * Gamification built on learning science – rewards go to the behaviours that
 * actually produce durable learning, not to busywork:
 *
 * - Retrieval practice (testing effect): every review earns XP, *including
 *   failed ones* – getting it wrong and seeing the answer is learning, and
 *   punishing errors would make people avoid hard cards.
 * - Cornell 5R (Record, Reduce, Recite, Reflect, Review): each step of a
 *   session is rewarded once, with a bonus for a summary written within 24 h
 *   (consolidation while the material is fresh).
 * - Habit formation: a small daily goal and a streak over *any* learning
 *   activity; achievements mark milestones, not grind.
 *
 * This module is pure (no DB) so it can be unit-tested and used on the client.
 */

// ---------------------------------------------------------------------------
// XP rules
// ---------------------------------------------------------------------------

export const XP = {
  /** Per review, by rating (1 Again … 4 Easy). Effort counts, not just success. */
  review: { 1: 3, 2: 4, 3: 5, 4: 5 } as Record<number, number>,
  record: 10, // session has notes
  reduce: 15, // questions/keywords formulated for the notes
  recite: 15, // recall run completed
  reflect: 20, // summary written
  reflectFresh: 10, // … within 24 h of the session
  cardsPerCard: 2,
  cardsMaxPerSession: 20,
  dailyGoal: 10, // bonus when the daily goal is reached
  examPerQuestion: 2, // practice exam finished – effort counts, not the score
  examMax: 60,
  focusPer5Min: 1, // finished Pomodoro block: 25 min = 5 XP
  focusMax: 18,
} as const;

/** One-time rewards are identified by reason + refId (see XpEvent). */
export type XpReason =
  | "review"
  | "record"
  | "reduce"
  | "recite"
  | "reflect"
  | "reflect_fresh"
  | "cards"
  | "daily_goal"
  | "exam"
  | "focus";

export const SUMMARY_MIN_CHARS = 40;
export const FRESH_SUMMARY_HOURS = 24;

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** Total XP needed to reach level n (n ≥ 1): 0, 100, 300, 600, 1000, … */
export function xpForLevel(n: number) {
  return 50 * (n - 1) * n;
}

const LEVEL_TITLES: [number, string][] = [
  [1, "Erstsemester"],
  [3, "Kommilitone"],
  [5, "Fleißbiene"],
  [8, "Tutor"],
  [12, "Überflieger"],
  [16, "Wissenschaftler"],
  [20, "Dozent"],
  [25, "Professor"],
  [30, "Koryphäe"],
];

export function levelTitle(level: number) {
  let title = LEVEL_TITLES[0]![1];
  for (const [min, t] of LEVEL_TITLES) if (level >= min) title = t;
  return title;
}

export function levelInfo(totalXp: number) {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    title: levelTitle(level),
    totalXp: xp,
    current: xp - start,
    needed: next - start,
    progress: (xp - start) / (next - start),
  };
}
export type LevelInfo = ReturnType<typeof levelInfo>;

// ---------------------------------------------------------------------------
// Streak & daily goal
// ---------------------------------------------------------------------------

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Consecutive days with learning activity, ending today. If today has no
 * activity yet the streak is still alive (it counts up to yesterday).
 */
export function computeStreak(activityDates: Date[], now = new Date()) {
  const days = new Set(activityDates.map(dayKey));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  const activeToday = days.has(dayKey(cursor));
  if (!activeToday) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, activeToday };
}

// ---------------------------------------------------------------------------
// Cornell 5R steps of a session
// ---------------------------------------------------------------------------

export type StepKey = "record" | "reduce" | "recite" | "reflect" | "review";

export interface SessionProgressInput {
  rows: { cue: string; content: string }[];
  summary: string;
  recallAt: Date | string | null;
  cardCount: number;
}

export const STEP_INFO: Record<StepKey, { label: string; short: string; hint: string }> = {
  record: { label: "Mitschreiben", short: "Mitschrift", hint: "Halte rechts fest, was in der Vorlesung erklärt wird." },
  reduce: { label: "Fragen formulieren", short: "Fragen", hint: "Formuliere links zu jeder Zeile eine echte Frage – Warum/Wie-Fragen verankern besser als Stichworte." },
  recite: { label: "Abfragen", short: "Abfragen", hint: "Decke die Notizen ab und beantworte die Fragen aus dem Gedächtnis." },
  reflect: { label: "Zusammenfassen", short: "Zusammenfassung", hint: "Fasse die Sitzung in 3–5 Sätzen in eigenen Worten zusammen – aus dem Kopf, erst danach vergleichen." },
  review: { label: "Wiederholen", short: "Karteikarten", hint: "Mach aus den Fragen Karteikarten – FSRS plant die Wiederholungen." },
};

export const STEP_ORDER: StepKey[] = ["record", "reduce", "recite", "reflect", "review"];

/** Which of the five Cornell steps are done – drives the stepper and XP. */
export function sessionSteps(input: SessionProgressInput): Record<StepKey, boolean> {
  const withContent = input.rows.filter((r) => r.content.trim());
  const withCue = input.rows.filter((r) => r.cue.trim());
  return {
    record: withContent.length > 0,
    // At least half of the noted rows need a question/keyword.
    reduce: withCue.length > 0 && withCue.length >= Math.ceil(withContent.length / 2),
    recite: !!input.recallAt,
    reflect: input.summary.trim().length >= SUMMARY_MIN_CHARS,
    review: input.cardCount > 0,
  };
}

export function nextStep(steps: Record<StepKey, boolean>): StepKey | null {
  return STEP_ORDER.find((k) => !steps[k]) ?? null;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface AchievementStats {
  sessions: number;
  summaries: number;
  freshSummaries: number;
  recalls: number;
  reviews: number;
  mastered: number;
  streak: number;
  level: number;
  correctInARow: number;
  /** Hour (0–23) of the latest review, if one was just made. */
  reviewHour: number | null;
  examReadyModules: number;
  exams: number;
  /** Best practice exam result in percent. */
  bestExamPercent: number;
}

export interface Achievement {
  key: string;
  title: string;
  description: string;
  emoji: string;
  unlocked: (s: AchievementStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first_session", emoji: "✍️", title: "Erste Mitschrift", description: "Deine erste Sitzung festgehalten.", unlocked: (s) => s.sessions >= 1 },
  { key: "first_summary", emoji: "🎯", title: "Auf den Punkt", description: "Erste Zusammenfassung geschrieben.", unlocked: (s) => s.summaries >= 1 },
  { key: "fresh_5", emoji: "🌱", title: "Solange es frisch ist", description: "5 Zusammenfassungen innerhalb von 24 Stunden.", unlocked: (s) => s.freshSummaries >= 5 },
  { key: "recall_10", emoji: "🧠", title: "Selbsttest-Profi", description: "10 Sitzungen aus dem Gedächtnis abgefragt.", unlocked: (s) => s.recalls >= 10 },
  { key: "reviews_100", emoji: "💯", title: "Hundert", description: "100 Karteikarten wiederholt.", unlocked: (s) => s.reviews >= 100 },
  { key: "reviews_1000", emoji: "🏔️", title: "Tausender", description: "1.000 Karteikarten wiederholt.", unlocked: (s) => s.reviews >= 1000 },
  { key: "mastered_25", emoji: "🏅", title: "Sitzt!", description: "25 Karten beherrscht (Stabilität ≥ 30 Tage).", unlocked: (s) => s.mastered >= 25 },
  { key: "mastered_250", emoji: "🏆", title: "Wissensschatz", description: "250 Karten beherrscht.", unlocked: (s) => s.mastered >= 250 },
  { key: "combo_10", emoji: "⚡", title: "Zehn am Stück", description: "10 Karten in Folge gewusst.", unlocked: (s) => s.correctInARow >= 10 },
  { key: "combo_25", emoji: "🔥", title: "On Fire", description: "25 Karten in Folge gewusst.", unlocked: (s) => s.correctInARow >= 25 },
  { key: "streak_3", emoji: "📅", title: "Dranbleiben", description: "3 Tage in Folge gelernt.", unlocked: (s) => s.streak >= 3 },
  { key: "streak_7", emoji: "🗓️", title: "Wochenroutine", description: "7 Tage in Folge gelernt.", unlocked: (s) => s.streak >= 7 },
  { key: "streak_30", emoji: "🚀", title: "Unaufhaltsam", description: "30 Tage in Folge gelernt.", unlocked: (s) => s.streak >= 30 },
  { key: "early_bird", emoji: "🌅", title: "Frühaufsteher", description: "Vor 8 Uhr wiederholt.", unlocked: (s) => s.reviewHour !== null && s.reviewHour >= 4 && s.reviewHour < 8 },
  { key: "night_owl", emoji: "🦉", title: "Nachteule", description: "Nach 22 Uhr wiederholt.", unlocked: (s) => s.reviewHour !== null && s.reviewHour >= 22 },
  { key: "exam_ready", emoji: "🎓", title: "Prüfungsbereit", description: "Eine Woche vor der Prüfung 80 % der Karten gefestigt.", unlocked: (s) => s.examReadyModules >= 1 },
  { key: "first_exam", emoji: "📝", title: "Generalprobe", description: "Erste Probeklausur geschrieben.", unlocked: (s) => s.exams >= 1 },
  { key: "exam_ace", emoji: "🥇", title: "Glatte Eins", description: "Probeklausur mit ≥ 95 % bestanden.", unlocked: (s) => s.bestExamPercent >= 95 },
  { key: "level_5", emoji: "⭐", title: "Level 5", description: "Level 5 erreicht.", unlocked: (s) => s.level >= 5 },
  { key: "level_10", emoji: "🌟", title: "Level 10", description: "Level 10 erreicht.", unlocked: (s) => s.level >= 10 },
];

export function newlyUnlocked(stats: AchievementStats, alreadyUnlocked: Set<string>) {
  return ACHIEVEMENTS.filter((a) => !alreadyUnlocked.has(a.key) && a.unlocked(stats));
}

/** Length of the most recent run of correct answers (rating > 1), newest first. */
export function correctRun(ratingsNewestFirst: number[]) {
  let n = 0;
  for (const r of ratingsNewestFirst) {
    if (r <= 1) break;
    n++;
  }
  return n;
}

/** After this many days a missing summary is shown as overdue (Cornell: within 24 h). */
export const SUMMARY_OVERDUE_DAYS = 2;
