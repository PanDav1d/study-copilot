"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { XP } from "@/lib/gamification";
import { id, noteCreateSchema, noteUpdateSchema, recallSchema } from "@/lib/validation";
import { authedAction } from "../action";
import { reward } from "../gamification";
import { ownedDocument, ownedNote } from "../ownership";
import * as notes from "../services/notes";

/** A session = one Cornell note per lecture day. Optionally attached to a calendar lecture. */
export const createNote = authedAction(noteCreateSchema, async (input, user) => {
  const result = await notes.createNote(user.id, input);
  revalidatePath("/", "layout");
  return result;
});

/** Autosave endpoint – only the provided fields are updated. */
export const updateNote = authedAction(noteUpdateSchema, async (input, user) => {
  const { updatedAt, reward: gained } = await notes.updateNote(user.id, input);
  // Structural changes affect lists elsewhere; pure content edits only this page.
  if (input.title !== undefined || input.date !== undefined || gained.xp > 0) revalidatePath("/", "layout");
  return { updatedAt: updatedAt.toISOString(), reward: gained };
});

/** Cornell "Recite": a recall run over all rows was finished. Rewarded once per day and session. */
export const completeRecall = authedAction(recallSchema, async ({ noteId, known, total }, user) => {
  await ownedNote(user.id, noteId);
  await db.note.update({ where: { id: noteId }, data: { recallAt: new Date(), recallScore: Math.min(1, known / total) } });
  const day = new Date().toISOString().slice(0, 10);
  const result = await reward(user.id, [{ amount: XP.recite, reason: "recite", refId: `${noteId}:${day}` }]);
  revalidatePath("/", "layout");
  return { reward: result };
});

export const deleteNote = authedAction(z.object({ id }), async ({ id }, user) => {
  await ownedNote(user.id, id);
  await db.note.delete({ where: { id } });
  revalidatePath("/", "layout");
});

export const linkNoteDocument = authedAction(
  z.object({ noteId: id, documentId: id }),
  async ({ noteId, documentId }, user) => {
    await ownedNote(user.id, noteId);
    await ownedDocument(user.id, documentId);
    await db.noteDocument.upsert({
      where: { noteId_documentId: { noteId, documentId } },
      create: { noteId, documentId },
      update: {},
    });
    revalidatePath(`/notes/${noteId}`);
  },
);

export const unlinkNoteDocument = authedAction(
  z.object({ noteId: id, documentId: id }),
  async ({ noteId, documentId }, user) => {
    await ownedNote(user.id, noteId);
    await db.noteDocument.deleteMany({ where: { noteId, documentId } });
    revalidatePath(`/notes/${noteId}`);
  },
);
