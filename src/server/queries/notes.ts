import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { missingSummaryWhere } from "./tasks";

export async function listNotes(userId: string, filter: { moduleId?: string; q?: string; missingSummary?: boolean } = {}) {
  const where: Prisma.NoteWhereInput = filter.missingSummary ? missingSummaryWhere(userId) : { userId };
  if (filter.moduleId) where.moduleId = filter.moduleId;
  if (filter.q) {
    where.OR = [
      { title: { contains: filter.q } },
      { sections: { contains: filter.q } },
      { summary: { contains: filter.q } },
    ];
  }
  return db.note.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      date: true,
      summary: true,
      sections: true,
      recallAt: true,
      updatedAt: true,
      module: { select: { id: true, name: true, color: true } },
      _count: { select: { flashcards: true, documents: true } },
    },
  });
}

export async function getNote(userId: string, id: string) {
  return db.note.findFirst({
    where: { id, userId },
    include: {
      module: { select: { id: true, name: true, color: true, semesterId: true, semester: { select: { name: true } } } },
      documents: {
        orderBy: { createdAt: "asc" },
        include: { document: { select: { id: true, title: true, size: true, originalName: true } } },
      },
      flashcards: { orderBy: { createdAt: "asc" }, select: { id: true, front: true, state: true } },
      calendarEvents: {
        where: { type: { in: ["LECTURE", "OTHER"] } },
        orderBy: { start: "asc" },
        take: 1,
        select: { id: true, start: true, end: true, location: true, allDay: true },
      },
    },
  });
}
