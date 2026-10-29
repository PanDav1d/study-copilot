import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof db;

function dayRange(date: Date) {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { gte: from, lt: to };
}

/**
 * The calendar entry a new session belongs to: an event of the same module on
 * the same day that has no session yet. Lectures win over other entries;
 * study sessions never count (they *refer* to sessions, they are not one).
 */
export async function findEventForSession(client: Client, userId: string, moduleId: string, date: Date) {
  const events = await client.calendarEvent.findMany({
    where: { userId, moduleId, noteId: null, type: { in: ["LECTURE", "OTHER"] }, start: dayRange(date) },
    orderBy: { start: "asc" },
    select: { id: true, type: true },
  });
  return events.find((e) => e.type === "LECTURE") ?? events[0] ?? null;
}

/** The session a new lecture belongs to: one of the module on that day that no lecture points to yet. */
export async function findSessionForEvent(client: Client, userId: string, moduleId: string, start: Date) {
  return client.note.findFirst({
    where: { userId, moduleId, date: dayRange(start), calendarEvents: { none: { type: "LECTURE" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}
