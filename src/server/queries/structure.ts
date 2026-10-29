import "server-only";
import { db } from "@/lib/db";
import { summarizeMastery } from "@/lib/srs/scheduler";
import { schedulerSettings } from "./settings";
import type { CurrentUser } from "../auth";

export async function listSemesters(userId: string) {
  return db.semester.findMany({
    where: { userId },
    orderBy: [{ number: "desc" }, { startDate: "desc" }, { createdAt: "desc" }],
    include: {
      modules: {
        orderBy: { name: "asc" },
        include: { _count: { select: { notes: true, flashcards: true, documents: true } } },
      },
    },
  });
}

/** Lightweight tree for selects and navigation. */
export async function structureTree(userId: string) {
  return db.semester.findMany({
    where: { userId },
    orderBy: [{ number: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      modules: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          color: true,
          room: true,
          examGroupId: true,
          notes: { orderBy: { date: "desc" }, select: { id: true, title: true, date: true } },
        },
      },
    },
  });
}
export type StructureTree = Awaited<ReturnType<typeof structureTree>>;

export async function getSemester(userId: string, id: string) {
  return db.semester.findFirst({
    where: { id, userId },
    include: {
      modules: {
        orderBy: { name: "asc" },
        include: { _count: { select: { notes: true, flashcards: true, documents: true } } },
      },
      documents: { where: { moduleId: null }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getModule(user: CurrentUser, id: string) {
  const mod = await db.module.findFirst({
    where: { id, userId: user.id },
    include: {
      semester: { select: { id: true, name: true } },
      notes: {
        orderBy: { date: "desc" },
        select: {
          id: true, title: true, date: true, sections: true, summary: true, recallAt: true, updatedAt: true,
          _count: { select: { flashcards: true, documents: true } },
        },
      },
      documents: { orderBy: { createdAt: "desc" } },
      calendarEvents: {
        where: { end: { gte: new Date() } },
        orderBy: { start: "asc" },
        take: 8,
      },
    },
  });
  if (!mod) return null;

  const cards = await db.flashcard.findMany({
    where: { moduleId: id, userId: user.id, suspended: false },
    select: {
      due: true, stability: true, difficulty: true, elapsedDays: true, scheduledDays: true,
      learningSteps: true, reps: true, lapses: true, state: true, lastReview: true, topic: true,
    },
  });
  const mastery = summarizeMastery(cards, new Date(), schedulerSettings(user));
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const due = cards.filter((c) => c.state !== 0 && c.due <= endOfDay).length;
  const topics = [...new Set(cards.map((c) => c.topic).filter((t): t is string => !!t))].sort();
  const examPartners = mod.examGroupId
    ? await db.module.findMany({
        where: { userId: user.id, examGroupId: mod.examGroupId, id: { not: id } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      })
    : [];

  return { ...mod, mastery, dueCount: due, topics, examPartners };
}

/** Every room/place used so far, most used first – suggested in all location fields. */
export async function knownRooms(userId: string) {
  const [events, modules] = await Promise.all([
    db.calendarEvent.groupBy({ by: ["location"], where: { userId, location: { not: null } }, _count: { _all: true } }),
    db.module.findMany({ where: { userId }, select: { room: true, examLocation: true } }),
  ]);
  const counts = new Map<string, number>();
  const add = (room: string | null, n = 1) => {
    const r = room?.trim();
    if (r) counts.set(r, (counts.get(r) ?? 0) + n);
  };
  for (const e of events) add(e.location, e._count._all);
  // Module rooms count extra: they are the deliberate choice.
  for (const m of modules) {
    add(m.room, 5);
    add(m.examLocation);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de")).slice(0, 200).map(([r]) => r);
}
