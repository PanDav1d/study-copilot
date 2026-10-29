"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { MIN_LOGGED_MINUTES } from "@/lib/focus";
import { XP } from "@/lib/gamification";
import { id } from "@/lib/validation";
import { authedAction } from "../action";
import { NO_REWARD, reward } from "../gamification";

/** A finished focus block: logged for the study-time statistics, small XP reward. */
export const logFocus = authedAction(
  z.object({
    moduleId: id.nullable(),
    startedAt: z.coerce.date(),
    minutes: z.number().int().min(MIN_LOGGED_MINUTES).max(240),
  }),
  async ({ moduleId, startedAt, minutes }, user) => {
    // A deleted / foreign module just means "no module".
    const owned = moduleId ? await db.module.findFirst({ where: { id: moduleId, userId: user.id }, select: { id: true } }) : null;
    // Never in the future, never longer than the time since it started.
    const now = Date.now();
    const start = new Date(Math.min(startedAt.getTime(), now - minutes * 60_000));
    const session = await db.focusSession.create({ data: { userId: user.id, moduleId: owned?.id ?? null, startedAt: start, minutes } });
    const xp = Math.min(XP.focusMax, Math.floor(minutes / 5) * XP.focusPer5Min);
    return xp > 0 ? reward(user.id, [{ amount: xp, reason: "focus", refId: session.id }]) : NO_REWARD;
  },
);

export const focusStats = authedAction(z.object({}), async (_input, user) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7)); // Monday
  const sessions = await db.focusSession.findMany({
    where: { userId: user.id, startedAt: { gte: week } },
    select: { minutes: true, startedAt: true, moduleId: true, module: { select: { name: true, color: true } } },
  });
  const byModule = new Map<string, { name: string; color: string | null; minutes: number }>();
  let todayMin = 0;
  let todayBlocks = 0;
  for (const s of sessions) {
    if (s.startedAt >= today) {
      todayMin += s.minutes;
      todayBlocks++;
    }
    const key = s.moduleId ?? "";
    const entry = byModule.get(key) ?? { name: s.module?.name ?? "Ohne Fach", color: s.module?.color ?? null, minutes: 0 };
    entry.minutes += s.minutes;
    byModule.set(key, entry);
  }
  return {
    todayMin,
    todayBlocks,
    weekMin: sessions.reduce((n, s) => n + s.minutes, 0),
    byModule: [...byModule.values()].sort((a, b) => b.minutes - a.minutes),
  };
});
