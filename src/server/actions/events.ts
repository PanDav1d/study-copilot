"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { eventSchema, id } from "@/lib/validation";
import { authedAction } from "../action";
import { ownedEvent } from "../ownership";
import { findSessionForEvent } from "../session-links";
import { checkEventRefs, createEvent as createCalendarEvent, eventData, rememberRoom } from "../services/events";

export const createEvent = authedAction(eventSchema, async (input, user) => {
  const { count } = await createCalendarEvent(user.id, input);
  revalidatePath("/", "layout");
  return { count };
});

export const updateEvent = authedAction(z.object({ id, data: eventSchema }), async ({ id, data }, user) => {
  await ownedEvent(user.id, id);
  await checkEventRefs(user.id, data);
  const update = eventData(data);
  await db.$transaction(async (tx) => {
    let noteId = update.noteId;
    if (data.createSession && data.type === "LECTURE" && data.moduleId && !noteId) {
      noteId =
        (await findSessionForEvent(tx, user.id, data.moduleId, update.start))?.id ??
        (await tx.note.create({ data: { userId: user.id, moduleId: data.moduleId, date: update.start } })).id;
    }
    await tx.calendarEvent.update({ where: { id }, data: { ...update, noteId } });
  });
  await rememberRoom(user.id, update);
  revalidatePath("/", "layout");
});

export const deleteEvent = authedAction(
  z.object({ id, scope: z.enum(["single", "following"]).default("single") }),
  async ({ id, scope }, user) => {
    const event = await ownedEvent(user.id, id);
    if (scope === "following" && event.seriesId) {
      await db.calendarEvent.deleteMany({
        where: { userId: user.id, seriesId: event.seriesId, start: { gte: event.start } },
      });
    } else {
      await db.calendarEvent.delete({ where: { id } });
    }
    revalidatePath("/", "layout");
  },
);

export const setEventCompleted = authedAction(
  z.object({ id, completed: z.boolean() }),
  async ({ id, completed }, user) => {
    await ownedEvent(user.id, id);
    await db.calendarEvent.update({ where: { id }, data: { completed } });
    revalidatePath("/", "layout");
  },
);
