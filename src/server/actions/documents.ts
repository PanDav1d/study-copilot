"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentUpdateSchema, id } from "@/lib/validation";
import { authedAction } from "../action";
import { deleteDocumentsWithFiles } from "../documents";
import { ownedDocument, resolveAssignment } from "../ownership";

export const updateDocument = authedAction(documentUpdateSchema, async ({ id, ...input }, user) => {
  await ownedDocument(user.id, id);
  const assignment = await resolveAssignment(user.id, input);
  await db.document.update({
    where: { id },
    data: { title: input.title, description: input.description, ...assignment },
  });
  revalidatePath("/", "layout");
});

export const deleteDocument = authedAction(z.object({ id }), async ({ id }, user) => {
  await ownedDocument(user.id, id);
  await deleteDocumentsWithFiles(user.id, { id });
  revalidatePath("/", "layout");
});

export const linkFlashcardDocument = authedAction(
  z.object({ flashcardId: id, documentId: id }),
  async ({ flashcardId, documentId }, user) => {
    const card = await db.flashcard.findFirst({ where: { id: flashcardId, userId: user.id }, select: { id: true } });
    if (!card) return;
    await ownedDocument(user.id, documentId);
    await db.flashcardDocument.upsert({
      where: { flashcardId_documentId: { flashcardId, documentId } },
      create: { flashcardId, documentId },
      update: {},
    });
    revalidatePath("/", "layout");
  },
);

/**
 * The PDF viewer reports where the reader is. Fire-and-forget, so nothing is
 * revalidated – the page never re-renders because of scrolling.
 */
export const saveReadingPosition = authedAction(
  z.object({ id, page: z.number().int().min(1).max(100_000), pageCount: z.number().int().min(1).max(100_000) }),
  async ({ id, page, pageCount }, user) => {
    await db.document.updateMany({
      where: { id, userId: user.id },
      data: { lastPage: Math.min(page, pageCount), pageCount, lastOpenedAt: new Date() },
    });
  },
);
