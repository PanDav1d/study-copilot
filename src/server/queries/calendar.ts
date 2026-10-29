import "server-only";
import { db } from "@/lib/db";
import { State } from "@/lib/srs/scheduler";

export interface CalendarItem {
  id: string;
  kind: "event" | "exam";
  type: string; // LECTURE | STUDY | DEADLINE | OTHER | EXAM
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  completed: boolean;
  location: string | null;
  description: string;
  seriesId: string | null;
  topic: string | null;
  module: { id: string; name: string; color: string } | null;
  note: { id: string; title: string; date: Date } | null;
  document: { id: string; title: string } | null;
}

/**
 * Modules with a shared exam (same `examGroupId`) become one entry whose name
 * lists all modules ("Mathematik I + Mathematik II"). Order is preserved.
 */
export function mergeSharedExams<T extends { name: string; examGroupId: string | null }>(modules: T[]): (T & { partnerNames: string[] })[] {
  const out: (T & { partnerNames: string[] })[] = [];
  const byGroup = new Map<string, T & { partnerNames: string[] }>();
  for (const m of modules) {
    const existing = m.examGroupId ? byGroup.get(m.examGroupId) : undefined;
    if (existing) {
      existing.partnerNames.push(m.name);
      existing.name = `${existing.name} + ${m.name}`;
      continue;
    }
    const item = { ...m, partnerNames: [] as string[] };
    if (m.examGroupId) byGroup.set(m.examGroupId, item);
    out.push(item);
  }
  return out;
}

/** Events, exams (derived from modules) and flashcard due counts in a date range. */
export async function calendarRange(userId: string, from: Date, to: Date) {
  const [events, exams, cards] = await Promise.all([
    db.calendarEvent.findMany({
      where: { userId, start: { lt: to }, end: { gte: from } },
      orderBy: { start: "asc" },
      include: {
        module: { select: { id: true, name: true, color: true } },
        note: { select: { id: true, title: true, date: true } },
        document: { select: { id: true, title: true } },
      },
    }),
    db.module.findMany({
      where: { userId, examDate: { gte: from, lt: to } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, examDate: true, examDuration: true, examType: true, examLocation: true, examGroupId: true },
    }),
    db.flashcard.findMany({
      where: { userId, suspended: false, state: { not: State.New }, due: { lt: to } },
      select: { due: true },
    }),
  ]);

  const items: CalendarItem[] = [
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      type: e.type,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      allDay: e.allDay,
      completed: e.completed,
      location: e.location,
      description: e.description,
      seriesId: e.seriesId,
      topic: e.topic,
      module: e.module,
      note: e.note,
      document: e.document,
    })),
    ...mergeSharedExams(exams).map((m) => {
      const start = m.examDate!;
      const end = new Date(start.getTime() + (m.examDuration ?? 90) * 60_000);
      return {
        id: `exam-${m.id}`,
        kind: "exam" as const,
        type: "EXAM",
        title: `Prüfung: ${m.name}`,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        completed: false,
        location: m.examLocation,
        description: "",
        seriesId: null,
        topic: null,
        module: { id: m.id, name: m.name, color: m.color },
        note: null,
        document: null,
      };
    }),
  ].sort((a, b) => a.start.localeCompare(b.start));

  // Due flashcards per local day (overdue ones are counted on today).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueByDay: Record<string, number> = {};
  for (const c of cards) {
    const d = c.due < today ? today : c.due;
    if (d < from) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dueByDay[key] = (dueByDay[key] ?? 0) + 1;
  }

  return { items, dueByDay };
}

export async function upcomingEvents(userId: string, opts: { from?: Date; days?: number; type?: string; take?: number } = {}) {
  const from = opts.from ?? new Date();
  const to = new Date(from.getTime() + (opts.days ?? 7) * 86_400_000);
  return db.calendarEvent.findMany({
    where: { userId, end: { gte: from }, start: { lt: to }, type: opts.type },
    orderBy: { start: "asc" },
    take: opts.take ?? 20,
    include: {
      module: { select: { id: true, name: true, color: true } },
      note: { select: { id: true, title: true, date: true } },
      document: { select: { id: true, title: true } },
    },
  });
}

export async function upcomingExams(userId: string, take = 6) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const modules = await db.module.findMany({
    where: { userId, examDate: { gte: startOfToday } },
    orderBy: [{ examDate: "asc" }, { name: "asc" }],
    take: take * 3,
    select: { id: true, name: true, color: true, examDate: true, examType: true, examLocation: true, examGroupId: true, examTopics: true, semester: { select: { name: true } } },
  });
  return mergeSharedExams(modules).slice(0, take);
}

/** Open study sessions in the past that were not marked done. */
export async function overdueStudyTasks(userId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return db.calendarEvent.findMany({
    where: { userId, type: "STUDY", completed: false, end: { lt: startOfToday } },
    orderBy: { start: "desc" },
    take: 10,
    include: { module: { select: { id: true, name: true, color: true } }, note: { select: { id: true, title: true, date: true } }, document: { select: { id: true, title: true } } },
  });
}
