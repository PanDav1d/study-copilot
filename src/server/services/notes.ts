import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import { newRowId, parseRows, serializeRows, type CornellRow } from "@/lib/cornell";
import { FRESH_SUMMARY_HOURS, sessionSteps, XP, type XpReason } from "@/lib/gamification";
import type { noteCreateSchema, noteUpdateSchema } from "@/lib/validation";
import { UserError } from "../errors";
import { reward, type Reward } from "../gamification";
import { ownedEvent, ownedModule, ownedNote } from "../ownership";
import { findEventForSession } from "../session-links";

/**
 * Session (Cornell note) logic shared by the server actions and the MCP server.
 * Inputs are already validated with the schemas from `@/lib/validation`;
 * callers handle auth and cache revalidation.
 */

/** A session = one Cornell note per lecture day. Optionally attached to a calendar lecture. */
export async function createNote(userId: string, { eventId, ...input }: z.output<typeof noteCreateSchema>) {
  await ownedModule(userId, input.moduleId);
  if (eventId) {
    const event = await ownedEvent(userId, eventId);
    if (event.moduleId && event.moduleId !== input.moduleId) throw new UserError("Der Termin gehört zu einem anderen Modul.");
  }
  const note = await db.note.create({ data: { ...input, userId } });
  // Without an explicit lecture, attach the module's calendar entry of that day.
  const linkTo = eventId ?? (await findEventForSession(db, userId, input.moduleId, input.date))?.id;
  if (linkTo) await db.calendarEvent.update({ where: { id: linkTo }, data: { noteId: note.id, moduleId: input.moduleId } });
  return { id: note.id, linkedEvent: !!linkTo };
}

function freshDeadline(sessionDate: Date) {
  const end = new Date(sessionDate);
  end.setHours(23, 59, 59, 999);
  return new Date(end.getTime() + FRESH_SUMMARY_HOURS * 3_600_000);
}

/** Grants the one-time XP for Cornell steps that are now complete. */
async function rewardSessionSteps(userId: string, noteId: string): Promise<Reward> {
  const note = await db.note.findUniqueOrThrow({
    where: { id: noteId },
    select: { sections: true, summary: true, recallAt: true, date: true, _count: { select: { flashcards: true } } },
  });
  const steps = sessionSteps({ rows: parseRows(note.sections), summary: note.summary, recallAt: note.recallAt, cardCount: note._count.flashcards });
  const items: { amount: number; reason: XpReason; refId: string }[] = [];
  if (steps.record) items.push({ amount: XP.record, reason: "record", refId: noteId });
  if (steps.reduce) items.push({ amount: XP.reduce, reason: "reduce", refId: noteId });
  if (steps.reflect) {
    items.push({ amount: XP.reflect, reason: "reflect", refId: noteId });
    if (new Date() <= freshDeadline(note.date)) items.push({ amount: XP.reflectFresh, reason: "reflect_fresh", refId: noteId });
  }
  return reward(userId, items);
}

/** Only the provided fields are updated. */
export async function updateNote(userId: string, { id, sections, ...data }: z.output<typeof noteUpdateSchema>) {
  const { moduleId } = await ownedNote(userId, id);
  const updated = await db.note.update({
    where: { id },
    data: { ...data, ...(sections && { sections: serializeRows(sections) }) },
    select: { updatedAt: true, calendarEvents: { where: { type: "LECTURE" }, select: { id: true } } },
  });
  // Moved to another day: pick up that day's lecture if the session has none yet.
  if (data.date && updated.calendarEvents.length === 0) {
    const event = await findEventForSession(db, userId, moduleId, data.date);
    if (event) await db.calendarEvent.update({ where: { id: event.id }, data: { noteId: id } });
  }
  return { updatedAt: updated.updatedAt, reward: await rewardSessionSteps(userId, id) };
}

/** Adds rows below the existing ones (empty trailing rows from the editor are dropped first). */
export async function appendRows(userId: string, noteId: string, rows: Omit<CornellRow, "id">[]) {
  await ownedNote(userId, noteId);
  const { sections } = await db.note.findUniqueOrThrow({ where: { id: noteId }, select: { sections: true } });
  const existing = parseRows(sections);
  while (existing.length && !existing.at(-1)!.cue.trim() && !existing.at(-1)!.content.trim()) existing.pop();
  const added = rows.map((r) => ({ id: newRowId(), cue: r.cue, content: r.content }));
  return { ...(await updateNote(userId, { id: noteId, sections: [...existing, ...added] })), rowCount: existing.length + added.length };
}
