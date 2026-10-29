"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isIcal } from "@/lib/ical";
import { calendarUrlSchema, eventImportSchema } from "@/lib/validation";
import { authedAction, UserError } from "../action";
import { ownedModule } from "../ownership";
import { findSessionForEvent } from "../session-links";

const MAX_ICS_BYTES = 8 * 1024 * 1024;

/** Downloads an iCal feed (e.g. a Rapla export link). Parsing happens in the browser preview. */
export const fetchCalendar = authedAction(calendarUrlSchema, async ({ url }) => {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" }, redirect: "follow" });
  } catch {
    throw new UserError("Der Kalender konnte nicht geladen werden. Link und Internetverbindung prüfen.");
  }
  if (!res.ok) throw new UserError(`Der Kalender-Server antwortet mit Fehler ${res.status}.`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_ICS_BYTES) throw new UserError("Der Kalender ist zu groß.");

  // Read with a hard limit – content-length is optional.
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ICS_BYTES) {
      await reader.cancel();
      throw new UserError("Der Kalender ist zu groß.");
    }
    chunks.push(value);
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  if (!isIcal(text)) throw new UserError("Unter diesem Link liegt kein iCal-Kalender (.ics).");
  return { text };
});

/**
 * Creates or updates (by `externalId`) many events at once. Imported lectures
 * pick up the module's room and are linked with the session of that day.
 */
export const importEvents = authedAction(eventImportSchema, async ({ events, createSessions }, user) => {
  const moduleIds = [...new Set(events.map((e) => e.moduleId).filter((m): m is string => !!m))];
  for (const id of moduleIds) await ownedModule(user.id, id);
  const rooms = new Map(
    (await db.module.findMany({ where: { userId: user.id, id: { in: moduleIds } }, select: { id: true, room: true } })).map((m) => [m.id, m.room]),
  );

  const existing = new Map<string, { id: string; moduleId: string | null; noteId: string | null }>();
  const ids = events.map((e) => e.externalId);
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db.calendarEvent.findMany({
      where: { userId: user.id, externalId: { in: ids.slice(i, i + 500) } },
      select: { id: true, externalId: true, moduleId: true, noteId: true },
    });
    for (const r of rows) existing.set(r.externalId!, r);
  }

  // New events with the same title and module form a series ("delete this & following").
  const groupSize = new Map<string, number>();
  const groupKey = (e: (typeof events)[number]) => `${e.title}\u0000${e.moduleId ?? ""}`;
  for (const e of events) if (!existing.has(e.externalId)) groupSize.set(groupKey(e), (groupSize.get(groupKey(e)) ?? 0) + 1);
  const seriesIds = new Map([...groupSize].filter(([, n]) => n > 1).map(([k]) => [k, randomUUID()]));

  const counts = { created: 0, updated: 0, linked: 0, sessions: 0 };
  await db.$transaction(
    async (tx) => {
      for (const e of events) {
        const location = e.location ?? (e.moduleId ? rooms.get(e.moduleId) : null) ?? null;
        const data = { type: e.type, title: e.title, description: e.description, location, start: e.start, end: e.end, allDay: e.allDay, moduleId: e.moduleId };
        const prev = existing.get(e.externalId);
        // A session only stays attached while the module is the same.
        let noteId = prev && prev.moduleId === e.moduleId ? prev.noteId : null;
        if (!noteId && e.type === "LECTURE" && e.moduleId) {
          noteId = (await findSessionForEvent(tx, user.id, e.moduleId, e.start))?.id ?? null;
          if (noteId) counts.linked++;
          else if (createSessions) {
            noteId = (await tx.note.create({ data: { userId: user.id, moduleId: e.moduleId, date: e.start } })).id;
            counts.sessions++;
          }
        }
        if (prev) {
          await tx.calendarEvent.update({ where: { id: prev.id }, data: { ...data, noteId } });
          counts.updated++;
        } else {
          await tx.calendarEvent.create({
            data: { ...data, noteId, externalId: e.externalId, seriesId: seriesIds.get(groupKey(e)) ?? null, userId: user.id },
          });
          counts.created++;
        }
      }
    },
    { timeout: 120_000 },
  );
  // Modules without a room take the room most of their imported lectures use.
  for (const id of moduleIds) {
    if (rooms.get(id)) continue;
    const tally = new Map<string, number>();
    for (const e of events) if (e.moduleId === id && e.type === "LECTURE" && e.location?.trim()) tally.set(e.location.trim(), (tally.get(e.location.trim()) ?? 0) + 1);
    const best = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) await db.module.update({ where: { id }, data: { room: best } });
  }
  revalidatePath("/", "layout");
  return counts;
});
