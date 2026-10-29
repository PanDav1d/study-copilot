import "server-only";
import { db } from "@/lib/db";
import { ownedModule } from "../ownership";

/**
 * The module's exam-prep note ("Zusammenfassung"): one free-form Markdown text per
 * module, shared by the server actions and the MCP server. Callers handle auth.
 */

export async function setSummaryNote(userId: string, moduleId: string, summaryNote: string) {
  await ownedModule(userId, moduleId);
  return db.module.update({ where: { id: moduleId }, data: { summaryNote }, select: { updatedAt: true } });
}

/** Appends a block below the existing text, separated by a blank line. */
export async function appendSummaryNote(userId: string, moduleId: string, text: string) {
  await ownedModule(userId, moduleId);
  const { summaryNote } = await db.module.findUniqueOrThrow({ where: { id: moduleId }, select: { summaryNote: true } });
  const next = summaryNote.trim() ? `${summaryNote.trimEnd()}\n\n${text.trim()}\n` : `${text.trim()}\n`;
  const { updatedAt } = await setSummaryNote(userId, moduleId, next);
  return { updatedAt, length: next.length };
}
