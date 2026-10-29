import "server-only";
import { db } from "@/lib/db";
import { nonEmptyRows, parseRows } from "@/lib/cornell";

/** Sessions of past/today's lectures that have no summary yet. */
export function missingSummaryWhere(userId: string) {
  return { userId, summary: "", date: { lte: new Date() } };
}

export async function openSummaryCount(userId: string) {
  return db.note.count({ where: missingSummaryWhere(userId) });
}

/** Lectures in the calendar (last two weeks) without a session/notes. */
const MISSED_LECTURE_DAYS = 14;

/** Everything that needs the student's attention, for the dashboard. */
export async function openTasks(userId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000 - 1);
  const lectureWhere = {
    userId,
    type: "LECTURE",
    noteId: null,
    moduleId: { not: null },
    start: { lte: endOfToday, gte: new Date(startOfToday.getTime() - MISSED_LECTURE_DAYS * 86_400_000) },
  };

  const [notes, summaryTotal, lectures, lectureTotal, studyTasks] = await Promise.all([
    db.note.findMany({
      where: missingSummaryWhere(userId),
      orderBy: { date: "desc" },
      take: 6,
      select: { id: true, title: true, date: true, sections: true, module: { select: { id: true, name: true, color: true } } },
    }),
    openSummaryCount(userId),
    db.calendarEvent.findMany({
      where: lectureWhere,
      orderBy: { start: "desc" },
      take: 4,
      select: { id: true, title: true, start: true, module: { select: { id: true, name: true, color: true } } },
    }),
    db.calendarEvent.count({ where: lectureWhere }),
    db.calendarEvent.findMany({
      where: { userId, type: "STUDY", completed: false, end: { lt: startOfToday } },
      orderBy: { start: "desc" },
      take: 4,
      select: { id: true, title: true, start: true, topic: true, module: { select: { id: true, name: true, color: true } } },
    }),
  ]);

  return {
    summaries: notes.map(({ sections, ...n }) => ({
      ...n,
      empty: nonEmptyRows(parseRows(sections)).length === 0,
      daysOpen: Math.max(0, Math.round((startOfToday.getTime() - new Date(n.date).setHours(0, 0, 0, 0)) / 86_400_000)),
    })),
    summaryTotal,
    lectures: lectures.filter((l): l is typeof l & { module: NonNullable<typeof l.module> } => !!l.module),
    lectureTotal,
    studyTasks,
    total: summaryTotal + lectureTotal + studyTasks.length,
  };
}
export type OpenTasks = Awaited<ReturnType<typeof openTasks>>;
