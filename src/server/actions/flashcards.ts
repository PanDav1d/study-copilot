"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { flashcardBulkSchema, flashcardSchema, id, reviewSchema } from "@/lib/validation";
import { isGrade, resetCard, review, rollback } from "@/lib/srs/scheduler";
import { XP } from "@/lib/gamification";
import { authedAction, UserError } from "../action";
import { reward, revokeXp } from "../gamification";
import { ownedFlashcard } from "../ownership";
import { schedulerSettings } from "../queries/settings";
import * as cards from "../services/flashcards";

const refresh = () => revalidatePath("/", "layout");

export const createFlashcard = authedAction(flashcardSchema, async (input, user) => {
  const result = await cards.createFlashcard(user.id, input);
  refresh();
  return result;
});

export const createFlashcards = authedAction(flashcardBulkSchema, async (input, user) => {
  const { count, reward: gained } = await cards.createFlashcards(user.id, input);
  refresh();
  return { count, reward: gained };
});

export const updateFlashcard = authedAction(
  z.object({ id, data: flashcardSchema }),
  async ({ id, data: { documentIds, ...data } }, user) => {
    await ownedFlashcard(user.id, id);
    await cards.checkCardRefs(user.id, data.moduleId, data.noteId, documentIds);
    await db.$transaction([
      db.flashcard.update({ where: { id }, data }),
      db.flashcardDocument.deleteMany({ where: { flashcardId: id } }),
      db.flashcardDocument.createMany({ data: documentIds.map((documentId) => ({ flashcardId: id, documentId })) }),
    ]);
    refresh();
  },
);

export const deleteFlashcard = authedAction(z.object({ id }), async ({ id }, user) => {
  await ownedFlashcard(user.id, id);
  await db.flashcard.delete({ where: { id } });
  refresh();
});

export const setFlashcardSuspended = authedAction(
  z.object({ id, suspended: z.boolean() }),
  async ({ id, suspended }, user) => {
    await ownedFlashcard(user.id, id);
    await db.flashcard.update({ where: { id }, data: { suspended } });
    refresh();
  },
);

/** Forget all learning progress of a card (e.g. after rewriting it). History is kept. */
export const resetFlashcard = authedAction(z.object({ id }), async ({ id }, user) => {
  await ownedFlashcard(user.id, id);
  await db.flashcard.update({ where: { id }, data: resetCard() });
  refresh();
});

export const reviewFlashcard = authedAction(reviewSchema, async ({ flashcardId, rating, durationMs }, user) => {
  if (!isGrade(rating)) throw new UserError("Ungültige Bewertung.");
  const card = await ownedFlashcard(user.id, flashcardId);
  const now = new Date();
  const result = review(card, rating, now, schedulerSettings(user));
  const [, log] = await db.$transaction([
    db.flashcard.update({ where: { id: card.id }, data: result.card }),
    db.reviewLog.create({ data: { ...result.log, flashcardId: card.id, userId: user.id, durationMs } }),
  ]);
  const gained = await reward(user.id, [{ amount: XP.review[rating] ?? 0, reason: "review", refId: log.id }], { reviewHour: now.getHours() });
  revalidatePath("/", "layout");
  return { card: serializeState(result.card), reward: gained };
});

function serializeState(c: ReturnType<typeof review>["card"]) {
  return { ...c, due: c.due.toISOString(), lastReview: c.lastReview?.toISOString() ?? null };
}

/** Undo the most recent review of a card. */
export const undoReview = authedAction(z.object({ flashcardId: id }), async ({ flashcardId }, user) => {
  const card = await ownedFlashcard(user.id, flashcardId);
  const last = await db.reviewLog.findFirst({ where: { flashcardId, userId: user.id }, orderBy: { review: "desc" } });
  if (!last) throw new UserError("Keine Wiederholung zum Rückgängigmachen.");
  const restored = rollback(card, last, schedulerSettings(user));
  await db.$transaction([
    db.flashcard.update({ where: { id: card.id }, data: restored }),
    db.reviewLog.delete({ where: { id: last.id } }),
  ]);
  await revokeXp(user.id, "review", last.id);
  revalidatePath("/", "layout");
  return serializeState(restored);
});
