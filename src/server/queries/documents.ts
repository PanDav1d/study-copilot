import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export async function listDocuments(
  userId: string,
  filter: { semesterId?: string; moduleId?: string; q?: string; unassigned?: boolean } = {},
) {
  const where: Prisma.DocumentWhereInput = { userId };
  if (filter.semesterId) where.semesterId = filter.semesterId;
  if (filter.moduleId) where.moduleId = filter.moduleId;
  if (filter.unassigned) where.semesterId = null;
  if (filter.q) {
    where.OR = [
      { title: { contains: filter.q } },
      { originalName: { contains: filter.q } },
      { description: { contains: filter.q } },
    ];
  }
  return db.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      semester: { select: { id: true, name: true } },
      module: { select: { id: true, name: true, color: true } },
      _count: { select: { notes: true, flashcards: true } },
    },
  });
}
export type DocumentListItem = Awaited<ReturnType<typeof listDocuments>>[number];

/** Minimal list for pickers (link a PDF from a note / flashcard / event). */
export async function documentOptions(userId: string) {
  return db.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, moduleId: true, module: { select: { name: true } } },
  });
}
export type DocumentOption = Awaited<ReturnType<typeof documentOptions>>[number];

export async function getDocument(userId: string, id: string) {
  return db.document.findFirst({
    where: { id, userId },
    include: {
      semester: { select: { id: true, name: true } },
      module: { select: { id: true, name: true, color: true } },
      notes: { include: { note: { select: { id: true, title: true, date: true } } } },
      flashcards: { include: { flashcard: { select: { id: true, front: true } } } },
      calendarEvents: { orderBy: { start: "asc" }, select: { id: true, title: true, start: true, type: true } },
    },
  });
}
