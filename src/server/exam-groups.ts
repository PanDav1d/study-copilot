import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { UserError } from "./errors";

/** Exam fields that are identical for all modules of one shared exam. */
export interface ExamFields {
  examDate: Date | null;
  examType: string | null;
  examDuration: number | null;
  examLocation: string | null;
  /** Undefined = keep (the text is edited in the module's exam tab, not in the dialog). */
  examTopics?: string;
  examNotes?: string;
}

export function pickExamFields<T extends ExamFields>(m: T): ExamFields {
  const { examDate, examType, examDuration, examLocation, examTopics, examNotes } = m;
  return { examDate, examType, examDuration, examLocation, examTopics, examNotes };
}

/**
 * The exam text a group shares when it is formed or joined: the module's own,
 * otherwise the first partner's that has any – nothing written gets lost.
 */
export async function groupExamText(tx: Prisma.TransactionClient, userId: string, moduleId: string | null, partnerIds: string[]) {
  const order = [...(moduleId ? [moduleId] : []), ...partnerIds];
  const rows = await tx.module.findMany({ where: { userId, id: { in: order } }, select: { id: true, examTopics: true, examNotes: true } });
  rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return {
    examTopics: rows.find((r) => r.examTopics.trim())?.examTopics ?? "",
    examNotes: rows.find((r) => r.examNotes.trim())?.examNotes ?? "",
  };
}

/**
 * Puts `moduleId` and `partnerIds` into one exam group (or removes the module
 * from its group when there are no partners) and copies the exam fields to
 * every member. Groups left with a single module are dissolved.
 */
export async function syncExamGroup(
  tx: Prisma.TransactionClient,
  userId: string,
  moduleId: string,
  partnerIds: string[],
  exam: ExamFields,
) {
  const partners = [...new Set(partnerIds)].filter((p) => p !== moduleId);
  const self = await tx.module.findFirstOrThrow({ where: { id: moduleId, userId }, select: { examGroupId: true } });
  const found = await tx.module.findMany({ where: { id: { in: partners }, userId }, select: { id: true, examGroupId: true } });
  if (found.length !== partners.length) throw new UserError("Ein gewähltes Modul wurde nicht gefunden.");

  const touchedGroups = new Set([self.examGroupId, ...found.map((f) => f.examGroupId)].filter((g): g is string => !!g));

  if (partners.length === 0) {
    if (self.examGroupId) await tx.module.update({ where: { id: moduleId }, data: { examGroupId: null } });
  } else {
    const groupId = self.examGroupId ?? found.find((f) => f.examGroupId)?.examGroupId ?? randomUUID();
    const members = [moduleId, ...partners];
    // Former members that were unticked leave the group (and keep their copy of the exam data).
    await tx.module.updateMany({ where: { userId, examGroupId: groupId, id: { notIn: members } }, data: { examGroupId: null } });
    await tx.module.updateMany({ where: { userId, id: { in: members } }, data: { ...exam, examGroupId: groupId } });
  }

  for (const g of touchedGroups) {
    const left = await tx.module.count({ where: { userId, examGroupId: g } });
    if (left === 1) await tx.module.updateMany({ where: { userId, examGroupId: g }, data: { examGroupId: null } });
  }
}
