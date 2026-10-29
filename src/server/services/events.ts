import "server-only";
import { randomUUID } from "node:crypto";
import { addWeeks } from "date-fns";
import type { z } from "zod";
import { db } from "@/lib/db";
import type { eventSchema } from "@/lib/validation";
import { UserError } from "../errors";
import { ownedDocument, ownedModule, ownedNote } from "../ownership";
import { findSessionForEvent } from "../session-links";

/** Calendar logic shared by the server actions and the MCP server. Inputs are validated. */

export type EventInput = z.output<typeof eventSchema>;

export async function checkEventRefs(userId: string, e: EventInput) {
  if (e.moduleId) await ownedModule(userId, e.moduleId);
  if (e.noteId) {
    const note = await ownedNote(userId, e.noteId);
    if (e.moduleId && note.moduleId !== e.moduleId) throw new UserError("Die Sitzung gehört nicht zu diesem Modul.");
  }
  if (e.documentId) await ownedDocument(userId, e.documentId);
}

async function moduleRoom(userId: string, moduleId: string) {
  return (await db.module.findFirst({ where: { id: moduleId, userId }, select: { room: true } }))?.room;
}

/** The first lecture with a room teaches the module its room – later events get it suggested. */
export async function rememberRoom(userId: string, e: { type: string; moduleId: string | null; location: string | null }) {
  if (e.type !== "LECTURE" || !e.moduleId || !e.location?.trim()) return;
  await db.module.updateMany({ where: { id: e.moduleId, userId, OR: [{ room: null }, { room: "" }] }, data: { room: e.location.trim() } });
}

export function eventData(e: EventInput) {
  const { repeatWeeks: _r, createSession: _c, ...data } = e;
  if (data.allDay) {
    data.start = new Date(data.start.getFullYear(), data.start.getMonth(), data.start.getDate());
    data.end = new Date(data.end.getFullYear(), data.end.getMonth(), data.end.getDate(), 23, 59);
  }
  return data;
}

export async function createEvent(userId: string, input: EventInput) {
  await checkEventRefs(userId, input);
  const base = eventData(input);
  if (!base.location && base.moduleId) base.location = (await moduleRoom(userId, base.moduleId)) ?? null;
  const occurrences = input.repeatWeeks + 1;
  const seriesId = occurrences > 1 ? randomUUID() : null;
  const lectureOf = input.type === "LECTURE" && !input.noteId ? input.moduleId : null;

  const ids: string[] = [];
  await db.$transaction(async (tx) => {
    for (let i = 0; i < occurrences; i++) {
      const start = addWeeks(base.start, i);
      const end = addWeeks(base.end, i);
      let noteId = i === 0 ? base.noteId : null;
      if (lectureOf) {
        // A session already written on that day belongs to this lecture.
        noteId = (await findSessionForEvent(tx, userId, lectureOf, start))?.id ?? null;
        if (!noteId && input.createSession) {
          // Sessions are identified by date; the topic is added later in the session itself.
          const note = await tx.note.create({ data: { userId, moduleId: lectureOf, date: start } });
          noteId = note.id;
        }
      }
      const event = await tx.calendarEvent.create({
        data: { ...base, start, end, noteId, seriesId, userId },
        select: { id: true },
      });
      ids.push(event.id);
    }
  });
  await rememberRoom(userId, base);
  return { count: occurrences, ids };
}
