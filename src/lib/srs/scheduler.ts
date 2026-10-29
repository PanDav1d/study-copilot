/**
 * Spaced repetition domain logic built on FSRS (Free Spaced Repetition Scheduler).
 *
 * FSRS models memory with three variables – Difficulty, Stability and
 * Retrievability (DSR model) – and schedules the next review when the
 * predicted recall probability drops to the requested retention (default 90 %).
 * We use the reference TypeScript implementation `ts-fsrs` and keep this module
 * free of database access so it can be unit-tested in isolation.
 */
import {
  type Card,
  type Grade,
  type ReviewLog,
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from "ts-fsrs";

export { Rating, State };
export type { Grade };

/** The subset of the Flashcard row that holds FSRS memory state. */
export interface StoredCardState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
}

/** The subset of a ReviewLog row needed to reconstruct a ts-fsrs ReviewLog. */
export interface StoredReviewLog {
  rating: number;
  state: number;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  review: Date;
}

export interface SchedulerSettings {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
}

export const DEFAULT_SETTINGS: SchedulerSettings = {
  requestRetention: 0.9,
  maximumInterval: 365,
  enableFuzz: true,
};

export const GRADES: readonly Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export const RATING_LABELS: Record<Grade, string> = {
  [Rating.Again]: "Nochmal",
  [Rating.Hard]: "Schwer",
  [Rating.Good]: "Gut",
  [Rating.Easy]: "Einfach",
};

export const RATING_HINTS: Record<Grade, string> = {
  [Rating.Again]: "Nicht gewusst / falsch",
  [Rating.Hard]: "Richtig, aber mühsam",
  [Rating.Good]: "Richtig nach kurzem Nachdenken",
  [Rating.Easy]: "Sofort und sicher gewusst",
};

export const STATE_LABELS: Record<State, string> = {
  [State.New]: "Neu",
  [State.Learning]: "Lernphase",
  [State.Review]: "Wiederholung",
  [State.Relearning]: "Neu lernen",
};

export function isGrade(value: number): value is Grade {
  return GRADES.includes(value as Grade);
}

export function createScheduler(settings: SchedulerSettings = DEFAULT_SETTINGS) {
  return fsrs(
    generatorParameters({
      request_retention: settings.requestRetention,
      maximum_interval: settings.maximumInterval,
      enable_fuzz: settings.enableFuzz,
      enable_short_term: true,
    }),
  );
}

export function newCardState(now = new Date()): StoredCardState {
  return fromFsrsCard(createEmptyCard(now));
}

export function toFsrsCard(s: StoredCardState): Card {
  return {
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.lastReview ?? undefined,
  };
}

export function fromFsrsCard(c: Card): StoredCardState {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ?? null,
  };
}

export function fromFsrsLog(log: ReviewLog): StoredReviewLog {
  return {
    rating: log.rating,
    state: log.state,
    due: log.due,
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    scheduledDays: log.scheduled_days,
    learningSteps: log.learning_steps,
    review: log.review,
  };
}

/** Apply a rating to a card and return the new state plus the review log to persist. */
export function review(
  card: StoredCardState,
  grade: Grade,
  now = new Date(),
  settings: SchedulerSettings = DEFAULT_SETTINGS,
) {
  const result = createScheduler(settings).next(toFsrsCard(card), now, grade);
  return { card: fromFsrsCard(result.card), log: fromFsrsLog(result.log) };
}

/** Next due date for every possible grade – shown on the rating buttons. */
export function previewIntervals(
  card: StoredCardState,
  now = new Date(),
  settings: SchedulerSettings = DEFAULT_SETTINGS,
): Record<Grade, Date> {
  const preview = createScheduler(settings).repeat(toFsrsCard(card), now);
  return {
    [Rating.Again]: preview[Rating.Again].card.due,
    [Rating.Hard]: preview[Rating.Hard].card.due,
    [Rating.Good]: preview[Rating.Good].card.due,
    [Rating.Easy]: preview[Rating.Easy].card.due,
  };
}

/** Restore the card state from before the given review (undo). */
export function rollback(
  card: StoredCardState,
  log: StoredReviewLog,
  settings: SchedulerSettings = DEFAULT_SETTINGS,
): StoredCardState {
  const restored = createScheduler(settings).rollback(toFsrsCard(card), {
    rating: log.rating as Rating,
    state: log.state as State,
    due: log.due,
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsedDays,
    last_elapsed_days: log.lastElapsedDays,
    scheduled_days: log.scheduledDays,
    learning_steps: log.learningSteps,
    review: log.review,
  });
  return fromFsrsCard(restored);
}

/** Reset a card to "new" (e.g. after the content was rewritten). */
export function resetCard(now = new Date()): StoredCardState {
  return newCardState(now);
}

/** Predicted probability (0..1) of recalling the card right now. */
export function retrievability(
  card: StoredCardState,
  now = new Date(),
  settings: SchedulerSettings = DEFAULT_SETTINGS,
): number {
  if (card.state === State.New) return 0;
  return createScheduler(settings).get_retrievability(toFsrsCard(card), now, false);
}

// ---------------------------------------------------------------------------
// Mastery classification
// ---------------------------------------------------------------------------

export type MasteryLevel = "new" | "learning" | "shaky" | "solid" | "mastered";

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: "Neu",
  learning: "In Lernphase",
  shaky: "Unsicher",
  solid: "Gefestigt",
  mastered: "Beherrscht",
};

export const MASTERY_ORDER: MasteryLevel[] = ["new", "learning", "shaky", "solid", "mastered"];

/** Thresholds in days of FSRS stability (time until recall drops to 90 %). */
export const SOLID_STABILITY_DAYS = 7;
export const MASTERED_STABILITY_DAYS = 30;
const SHAKY_RETRIEVABILITY = 0.8;

export function masteryLevel(
  card: StoredCardState,
  now = new Date(),
  settings: SchedulerSettings = DEFAULT_SETTINGS,
): MasteryLevel {
  if (card.state === State.New) return "new";
  if (card.state === State.Learning || card.state === State.Relearning) return "learning";
  const r = retrievability(card, now, settings);
  if (r < SHAKY_RETRIEVABILITY || card.stability < SOLID_STABILITY_DAYS) return "shaky";
  if (card.stability < MASTERED_STABILITY_DAYS) return "solid";
  return "mastered";
}

export function summarizeMastery(
  cards: StoredCardState[],
  now = new Date(),
  settings: SchedulerSettings = DEFAULT_SETTINGS,
) {
  const counts: Record<MasteryLevel, number> = { new: 0, learning: 0, shaky: 0, solid: 0, mastered: 0 };
  for (const c of cards) counts[masteryLevel(c, now, settings)]++;
  const total = cards.length;
  // Progress = share of cards that are at least "solid".
  const progress = total === 0 ? 0 : (counts.solid + counts.mastered) / total;
  return { counts, total, progress };
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

/** Learning cards due within this window are shown in the current session. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

export interface QueueCandidate extends StoredCardState {
  id: string;
  createdAt: Date;
  /** Exam date of the card's module, used for prioritisation. */
  examDate?: Date | null;
}

export function endOfLocalDay(now: Date) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Whether a (non-new) card is due for review now. */
export function isDue(card: StoredCardState, now = new Date()) {
  if (card.state === State.New) return false;
  if (card.state === State.Review) return card.due <= endOfLocalDay(now);
  return card.due.getTime() <= now.getTime() + LEARN_AHEAD_MS;
}

export function isOverdue(card: StoredCardState, now = new Date()) {
  if (card.state === State.New) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return card.due < startOfToday;
}

const EXAM_BOOST_WINDOW_DAYS = 21;

/** 0..1 urgency: 1 when the exam is today, 0 when it is ≥ 3 weeks away or past. */
export function examUrgency(examDate: Date | null | undefined, now = new Date()) {
  if (!examDate) return 0;
  const days = (examDate.getTime() - now.getTime()) / 86_400_000;
  if (days < -1 || days > EXAM_BOOST_WINDOW_DAYS) return 0;
  return 1 - Math.max(0, days) / EXAM_BOOST_WINDOW_DAYS;
}

/**
 * Build the review queue:
 * 1. Due (re)learning cards first – short-term steps must not be postponed.
 * 2. Due review cards ordered by lowest retrievability (most at risk of being
 *    forgotten), boosted for modules with an upcoming exam.
 * 3. New cards up to the remaining daily limit, upcoming-exam modules first.
 */
export function buildReviewQueue<T extends QueueCandidate>(
  cards: T[],
  options: { now?: Date; newLimit: number; settings?: SchedulerSettings },
): T[] {
  const now = options.now ?? new Date();
  const settings = options.settings ?? DEFAULT_SETTINGS;

  const learning: T[] = [];
  const reviews: { card: T; score: number }[] = [];
  const fresh: { card: T; score: number }[] = [];

  for (const card of cards) {
    if (card.state === State.New) {
      fresh.push({ card, score: examUrgency(card.examDate, now) });
    } else if (isDue(card, now)) {
      if (card.state === State.Review) {
        const r = retrievability(card, now, settings);
        reviews.push({ card, score: r - 0.3 * examUrgency(card.examDate, now) });
      } else {
        learning.push(card);
      }
    }
  }

  learning.sort((a, b) => a.due.getTime() - b.due.getTime());
  reviews.sort((a, b) => a.score - b.score || a.card.due.getTime() - b.card.due.getTime());
  fresh.sort((a, b) => b.score - a.score || a.card.createdAt.getTime() - b.card.createdAt.getTime());

  return [
    ...learning,
    ...reviews.map((r) => r.card),
    ...fresh.slice(0, Math.max(0, options.newLimit)).map((f) => f.card),
  ];
}

/** Number of cards that become due on each of the next `days` days. */
export function dueForecast(cards: StoredCardState[], days: number, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, () => 0);
  for (const c of cards) {
    if (c.state === State.New) continue;
    const diff = Math.floor((c.due.getTime() - start.getTime()) / 86_400_000);
    const idx = Math.max(0, diff); // overdue cards count for today
    if (idx < days) buckets[idx]!++;
  }
  return buckets.map((count, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return { date, count };
  });
}
