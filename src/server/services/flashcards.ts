import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import { XP } from "@/lib/gamification";
import { newCardState } from "@/lib/srs/scheduler";
import type { flashcardBulkSchema, flashcardSchema } from "@/lib/validation";
import { UserError } from "../errors";
import { reward } from "../gamification";
import { ownedDocuments, ownedModule, ownedNote } from "../ownership";

/** Flashcard creation shared by the server actions and the MCP server. Inputs are validated. */

export async function checkCardRefs(userId: string, moduleId: string, noteId: string | null, documentIds: string[]) {
  await ownedModule(userId, moduleId);
  if (noteId) {
    const note = await ownedNote(userId, noteId);
    if (note.moduleId !== moduleId) throw new UserError("Die Sitzung gehört nicht zu diesem Modul.");
  }
  await ownedDocuments(userId, documentIds);
}

export async function createFlashcard(userId: string, { documentIds, ...input }: z.output<typeof flashcardSchema>) {
  await checkCardRefs(userId, input.moduleId, input.noteId, documentIds);
  const card = await db.flashcard.create({
    data: {
      ...input,
      ...newCardState(),
      userId,
      documents: { create: documentIds.map((documentId) => ({ documentId })) },
    },
  });
  return { id: card.id, reward: await rewardCards(userId, [card.id]) };
}

export async function createFlashcards(userId: string, input: z.output<typeof flashcardBulkSchema>) {
  await checkCardRefs(userId, input.moduleId, input.noteId, []);
  const now = new Date();
  const created = await db.flashcard.createManyAndReturn({
    select: { id: true },
    data: input.cards.map((c, i) => ({
      ...c,
      ...newCardState(now),
      // Stable creation order keeps the new-card queue in note order.
      createdAt: new Date(now.getTime() + i),
      moduleId: input.moduleId,
      noteId: input.noteId,
      topic: input.topic,
      userId,
    })),
  });
  return { count: input.cards.length, ids: created.map((c) => c.id), reward: await rewardCards(userId, created.map((c) => c.id)) };
}

/** Writing cards is generative learning – rewarded, but capped per day so XP stays meaningful. */
const DAILY_CARD_XP_CAP = 40;
async function rewardCards(userId: string, cardIds: string[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = await db.xpEvent.aggregate({ where: { userId, reason: "cards", createdAt: { gte: start } }, _sum: { amount: true } });
  const left = Math.max(0, DAILY_CARD_XP_CAP - (today._sum.amount ?? 0));
  const ids = cardIds.slice(0, Math.floor(left / XP.cardsPerCard));
  return reward(userId, ids.map((refId) => ({ amount: XP.cardsPerCard, reason: "cards" as const, refId })));
}
