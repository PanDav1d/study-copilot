import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  ACHIEVEMENTS,
  computeStreak,
  correctRun,
  levelInfo,
  newlyUnlocked,
  XP,
  type AchievementStats,
  type XpReason,
} from "@/lib/gamification";
import { State } from "@/lib/srs/scheduler";

/** What the client shows after an action: "+5 XP", level-up, new achievements. */
export interface Reward {
  xp: number;
  levelUp: number | null;
  achievements: { key: string; title: string; emoji: string; description: string }[];
  goalReached: boolean;
}

export const NO_REWARD: Reward = { xp: 0, levelUp: null, achievements: [], goalReached: false };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function totalXp(userId: string) {
  const agg = await db.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

/**
 * Record XP. One-time rewards are idempotent through the unique
 * (userId, reason, refId) index – a second grant returns 0.
 */
export async function grantXp(userId: string, amount: number, reason: XpReason, refId: string | null = null) {
  if (amount <= 0) return 0;
  try {
    await db.xpEvent.create({ data: { userId, amount, reason, refId } });
    return amount;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return 0;
    throw e;
  }
}

export async function revokeXp(userId: string, reason: XpReason, refId: string) {
  await db.xpEvent.deleteMany({ where: { userId, reason, refId } });
}

async function achievementStats(userId: string, level: number, reviewHour: number | null): Promise<AchievementStats> {
  const since = new Date(Date.now() - 400 * 86_400_000);
  const weekAhead = new Date(Date.now() + 7 * 86_400_000);
  const [sessions, reasonCounts, reviews, mastered, activity, recent, examModules, attempts] = await Promise.all([
    db.note.count({ where: { userId, NOT: { sections: "[]" } } }),
    db.xpEvent.groupBy({ by: ["reason"], where: { userId, reason: { in: ["reflect", "reflect_fresh", "recite"] } }, _count: true }),
    db.reviewLog.count({ where: { userId } }),
    db.flashcard.count({ where: { userId, state: State.Review, stability: { gte: 30 } } }),
    db.xpEvent.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.reviewLog.findMany({ where: { userId }, orderBy: { review: "desc" }, take: 30, select: { rating: true } }),
    db.module.findMany({
      where: { userId, examDate: { gte: new Date(), lte: weekAhead } },
      select: { flashcards: { where: { suspended: false }, select: { state: true, stability: true } } },
    }),
    db.examAttempt.findMany({ where: { userId }, select: { score: true, maxScore: true } }),
  ]);
  const count = (r: string) => reasonCounts.find((c) => c.reason === r)?._count ?? 0;
  const examReadyModules = examModules.filter((m) => {
    if (m.flashcards.length < 10) return false;
    const solid = m.flashcards.filter((c) => c.state === State.Review && c.stability >= 7).length;
    return solid / m.flashcards.length >= 0.8;
  }).length;

  return {
    sessions,
    summaries: count("reflect"),
    freshSummaries: count("reflect_fresh"),
    recalls: count("recite"),
    reviews,
    mastered,
    streak: computeStreak(activity.map((a) => a.createdAt)).streak,
    level,
    correctInARow: correctRun(recent.map((r) => r.rating)),
    reviewHour,
    examReadyModules,
    exams: attempts.length,
    bestExamPercent: Math.max(0, ...attempts.map((a) => (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0))),
  };
}

/**
 * Call after XP was granted: adds the daily-goal bonus, detects a level-up and
 * unlocks achievements. Returns everything the UI should celebrate.
 */
export async function settleRewards(
  userId: string,
  xpBefore: number,
  gained: number,
  opts: { reviewHour?: number | null } = {},
): Promise<Reward> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { dailyXpGoal: true } });
  let xp = gained;
  let goalReached = false;

  if (gained > 0) {
    const today = await db.xpEvent.aggregate({
      where: { userId, createdAt: { gte: startOfToday() }, reason: { not: "daily_goal" } },
      _sum: { amount: true },
    });
    if ((today._sum.amount ?? 0) >= user.dailyXpGoal) {
      const bonus = await grantXp(userId, XP.dailyGoal, "daily_goal", todayKey());
      goalReached = bonus > 0;
      xp += bonus;
    }
  }

  const before = levelInfo(xpBefore);
  const after = levelInfo(xpBefore + xp);
  const unlocked = await db.userAchievement.findMany({ where: { userId }, select: { key: true } });
  const fresh = newlyUnlocked(await achievementStats(userId, after.level, opts.reviewHour ?? null), new Set(unlocked.map((u) => u.key)));
  if (fresh.length) {
    await db.userAchievement.createMany({ data: fresh.map((a) => ({ userId, key: a.key })) });
  }

  return {
    xp,
    levelUp: after.level > before.level ? after.level : null,
    achievements: fresh.map(({ key, title, emoji, description }) => ({ key, title, emoji, description })),
    goalReached,
  };
}

/** Grant one or more XP items and settle rewards in one go. */
export async function reward(
  userId: string,
  items: { amount: number; reason: XpReason; refId?: string | null }[],
  opts: { reviewHour?: number | null } = {},
): Promise<Reward> {
  // Skip one-time rewards that were already granted (cheap check before inserting).
  const keyed = items.filter((i) => i.refId);
  const existing = keyed.length
    ? await db.xpEvent.findMany({
        where: { userId, OR: keyed.map((i) => ({ reason: i.reason, refId: i.refId })) },
        select: { reason: true, refId: true },
      })
    : [];
  const todo = items.filter((i) => !i.refId || !existing.some((e) => e.reason === i.reason && e.refId === i.refId));
  if (todo.length === 0 && opts.reviewHour == null) return NO_REWARD;

  const before = await totalXp(userId);
  let gained = 0;
  for (const item of todo) gained += await grantXp(userId, item.amount, item.reason, item.refId ?? null);
  if (gained === 0 && opts.reviewHour == null) return NO_REWARD;
  return settleRewards(userId, before, gained, opts);
}

/** Header/dashboard state: level, today's XP vs goal, streak. */
export async function gamificationState(userId: string) {
  const since = new Date(Date.now() - 400 * 86_400_000);
  const [total, user, today, activity, achievements] = await Promise.all([
    totalXp(userId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { dailyXpGoal: true } }),
    db.xpEvent.aggregate({ where: { userId, createdAt: { gte: startOfToday() } }, _sum: { amount: true } }),
    db.xpEvent.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.userAchievement.findMany({ where: { userId }, orderBy: { unlockedAt: "desc" } }),
  ]);
  const { streak, activeToday } = computeStreak(activity.map((a) => a.createdAt));
  return {
    ...levelInfo(total),
    xpToday: today._sum.amount ?? 0,
    dailyGoal: user.dailyXpGoal,
    streak,
    activeToday,
    achievements: ACHIEVEMENTS.map((a) => {
      const u = achievements.find((x) => x.key === a.key);
      return { key: a.key, title: a.title, emoji: a.emoji, description: a.description, unlockedAt: u?.unlockedAt ?? null };
    }),
  };
}
export type GamificationState = Awaited<ReturnType<typeof gamificationState>>;
