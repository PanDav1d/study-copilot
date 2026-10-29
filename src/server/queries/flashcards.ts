import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  buildReviewQueue,
  dueForecast,
  endOfLocalDay,
  isOverdue,
  masteryLevel,
  previewIntervals,
  retrievability,
  summarizeMastery,
  type MasteryLevel,
  State,
} from "@/lib/srs/scheduler";
import type { CurrentUser } from "../auth";
import { schedulerSettings } from "./settings";

const stateSelect = {
  due: true, stability: true, difficulty: true, elapsedDays: true, scheduledDays: true,
  learningSteps: true, reps: true, lapses: true, state: true, lastReview: true,
} as const;

export interface FlashcardFilter {
  moduleId?: string;
  topic?: string;
  q?: string;
  level?: MasteryLevel | "due" | "suspended";
}

export async function listFlashcards(user: CurrentUser, filter: FlashcardFilter) {
  const where: Prisma.FlashcardWhereInput = { userId: user.id };
  if (filter.moduleId) where.moduleId = filter.moduleId;
  if (filter.topic) where.topic = filter.topic;
  if (filter.q) where.OR = [{ front: { contains: filter.q } }, { back: { contains: filter.q } }, { topic: { contains: filter.q } }];
  if (filter.level === "suspended") where.suspended = true;
  else if (filter.level) where.suspended = false;

  const cards = await db.flashcard.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 1000,
    include: {
      module: { select: { id: true, name: true, color: true } },
      note: { select: { id: true, title: true } },
      documents: { include: { document: { select: { id: true, title: true } } } },
    },
  });
  const now = new Date();
  const settings = schedulerSettings(user);
  const endOfDay = endOfLocalDay(now);
  return cards
    .map((c) => ({ ...c, level: masteryLevel(c, now, settings), retrievability: retrievability(c, now, settings) }))
    .filter((c) => {
      if (!filter.level || filter.level === "suspended") return true;
      if (filter.level === "due") return c.state !== State.New && c.due <= endOfDay;
      return c.level === filter.level;
    });
}
export type FlashcardListItem = Awaited<ReturnType<typeof listFlashcards>>[number];

export async function getFlashcard(user: CurrentUser, id: string) {
  const card = await db.flashcard.findFirst({
    where: { id, userId: user.id },
    include: {
      module: { select: { id: true, name: true, color: true } },
      note: { select: { id: true, title: true } },
      documents: { include: { document: { select: { id: true, title: true } } } },
      reviewLogs: { orderBy: { review: "desc" }, take: 100 },
    },
  });
  if (!card) return null;
  const now = new Date();
  const settings = schedulerSettings(user);
  return { ...card, level: masteryLevel(card, now, settings), retrievability: retrievability(card, now, settings) };
}

export async function flashcardTopics(userId: string, moduleId?: string) {
  const rows = await db.flashcard.findMany({
    where: { userId, moduleId, topic: { not: null } },
    distinct: ["topic"],
    select: { topic: true },
    orderBy: { topic: "asc" },
  });
  return rows.map((r) => r.topic!).filter(Boolean);
}

async function newCardsIntroducedToday(userId: string, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return db.reviewLog.count({ where: { userId, state: State.New, review: { gte: start } } });
}

export type ReviewMode = "due" | "cram";

/**
 * Cards for a review session.
 * - "due": FSRS queue (due/overdue cards + limited number of new cards)
 * - "cram": exam preparation – all cards of the selection, weakest first.
 *   Ratings still feed FSRS, which handles early reviews correctly.
 */
export async function reviewQueue(
  user: CurrentUser,
  opts: { moduleId?: string; topic?: string; noteId?: string; mode: ReviewMode; limit?: number },
) {
  const now = new Date();
  const settings = schedulerSettings(user);
  const cards = await db.flashcard.findMany({
    where: { userId: user.id, suspended: false, moduleId: opts.moduleId, topic: opts.topic, noteId: opts.noteId },
    include: {
      module: { select: { id: true, name: true, color: true, examDate: true } },
      note: { select: { id: true, title: true } },
      documents: { include: { document: { select: { id: true, title: true } } } },
    },
  });

  let queue;
  if (opts.mode === "cram") {
    queue = cards
      .map((c) => ({ c, r: c.state === State.New ? -1 : retrievability(c, now, settings) }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.c)
      .slice(0, opts.limit ?? 100);
  } else {
    const remainingNew = Math.max(0, user.dailyNewLimit - (await newCardsIntroducedToday(user.id, now)));
    queue = buildReviewQueue(
      cards.map((c) => ({ ...c, examDate: c.module.examDate })),
      { now, newLimit: remainingNew, settings },
    ).slice(0, opts.limit ?? 500);
  }

  return queue.map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    topic: c.topic,
    state: c.state,
    reps: c.reps,
    lapses: c.lapses,
    module: { id: c.module.id, name: c.module.name, color: c.module.color },
    note: c.note,
    documents: c.documents.map((d) => d.document),
    previews: Object.fromEntries(
      Object.entries(previewIntervals(c, now, settings)).map(([k, v]) => [k, v.toISOString()]),
    ) as Record<1 | 2 | 3 | 4, string>,
    cardState: {
      due: c.due.toISOString(), stability: c.stability, difficulty: c.difficulty, elapsedDays: c.elapsedDays,
      scheduledDays: c.scheduledDays, learningSteps: c.learningSteps, reps: c.reps, lapses: c.lapses,
      state: c.state, lastReview: c.lastReview?.toISOString() ?? null,
    },
  }));
}
export type ReviewQueueItem = Awaited<ReturnType<typeof reviewQueue>>[number];

/** Learning status per module, used by the study area and the dashboard. */
export async function studyOverview(user: CurrentUser) {
  const now = new Date();
  const settings = schedulerSettings(user);
  const endOfDay = endOfLocalDay(now);
  const [modules, introducedToday] = await Promise.all([
    db.module.findMany({
      where: { userId: user.id },
      orderBy: [{ semester: { createdAt: "desc" } }, { name: "asc" }],
      select: {
        id: true, name: true, color: true, examDate: true, examType: true,
        semester: { select: { id: true, name: true } },
        flashcards: { where: { suspended: false }, select: { ...stateSelect, topic: true } },
      },
    }),
    newCardsIntroducedToday(user.id, now),
  ]);

  const newLimitLeft = Math.max(0, user.dailyNewLimit - introducedToday);
  const allCards = modules.flatMap((m) => m.flashcards);

  const perModule = modules.map((m) => {
    const due = m.flashcards.filter((c) => c.state !== State.New && c.due <= endOfDay);
    return {
      id: m.id,
      name: m.name,
      color: m.color,
      examDate: m.examDate,
      examType: m.examType,
      semester: m.semester,
      due: due.length,
      overdue: due.filter((c) => isOverdue(c, now)).length,
      newCount: m.flashcards.filter((c) => c.state === State.New).length,
      mastery: summarizeMastery(m.flashcards, now, settings),
      topics: [...new Set(m.flashcards.map((c) => c.topic).filter((t): t is string => !!t))].sort(),
    };
  });

  const dueTotal = perModule.reduce((s, m) => s + m.due, 0);
  const newTotal = perModule.reduce((s, m) => s + m.newCount, 0);
  return {
    modules: perModule,
    dueTotal,
    overdueTotal: perModule.reduce((s, m) => s + m.overdue, 0),
    newTotal,
    newAvailableToday: Math.min(newTotal, newLimitLeft),
    mastery: summarizeMastery(allCards, now, settings),
    forecast: dueForecast(allCards, 14, now),
  };
}

/** Reviews per day for the last `days` days (activity heatmap / streak). */
export async function reviewActivity(userId: string, days = 84) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const logs = await db.reviewLog.findMany({
    where: { userId, review: { gte: start } },
    select: { review: true, rating: true },
  });
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: d, count: 0, correct: 0 };
  });
  for (const l of logs) {
    const idx = Math.floor((l.review.getTime() - start.getTime()) / 86_400_000);
    const bucket = buckets[idx];
    if (bucket) {
      bucket.count++;
      if (l.rating > 1) bucket.correct++;
    }
  }
  // Streak: consecutive days with reviews ending today (or yesterday).
  let streak = 0;
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (buckets[i]!.count > 0) streak++;
    else if (i === buckets.length - 1) continue;
    else break;
  }
  const today = buckets[buckets.length - 1]!;
  return { buckets, streak, today };
}
