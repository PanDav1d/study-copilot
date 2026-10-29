"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { id, moduleExamTextSchema, moduleSchema, moduleSummaryNoteSchema, semesterSchema } from "@/lib/validation";
import { authedAction } from "../action";
import { deleteDocumentsWithFiles } from "../documents";
import { groupExamText, pickExamFields, syncExamGroup } from "../exam-groups";
import { ownedModule, ownedSemester } from "../ownership";
import { setSummaryNote } from "../services/modules";

const refresh = () => revalidatePath("/", "layout");

// --- Semester -------------------------------------------------------------------

export const createSemester = authedAction(semesterSchema, async (input, user) => {
  const semester = await db.semester.create({ data: { ...input, userId: user.id } });
  refresh();
  return { id: semester.id };
});

export const updateSemester = authedAction(
  z.object({ id, data: semesterSchema }),
  async ({ id, data }, user) => {
    await ownedSemester(user.id, id);
    await db.semester.update({ where: { id }, data });
    refresh();
  },
);

export const deleteSemester = authedAction(z.object({ id }), async ({ id }, user) => {
  await ownedSemester(user.id, id);
  // Documents directly in this semester or in one of its modules lose their file too.
  await deleteDocumentsWithFiles(user.id, {
    OR: [{ semesterId: id }, { module: { semesterId: id } }],
  });
  await db.semester.delete({ where: { id } });
  refresh();
});

// --- Module ---------------------------------------------------------------------

export const createModule = authedAction(moduleSchema, async ({ examPartnerIds, ...input }, user) => {
  await ownedSemester(user.id, input.semesterId);
  const mod = await db.$transaction(async (tx) => {
    const mod = await tx.module.create({ data: { ...input, userId: user.id } });
    if (examPartnerIds.length) {
      const text = await groupExamText(tx, user.id, null, examPartnerIds);
      await syncExamGroup(tx, user.id, mod.id, examPartnerIds, pickExamFields({ ...input, ...text }));
    }
    return mod;
  });
  refresh();
  return { id: mod.id };
});

export const updateModule = authedAction(
  z.object({ id, data: moduleSchema }),
  async ({ id, data: { examPartnerIds, ...data } }, user) => {
    await ownedModule(user.id, id);
    await ownedSemester(user.id, data.semesterId);
    const before = await db.module.findUniqueOrThrow({ where: { id }, select: { room: true } });
    await db.$transaction(async (tx) => {
      await tx.module.update({ where: { id }, data });
      // Keep document → semester assignment consistent when a module moves.
      await tx.document.updateMany({ where: { moduleId: id, userId: user.id }, data: { semesterId: data.semesterId } });
      const text = examPartnerIds.length ? await groupExamText(tx, user.id, id, examPartnerIds) : {};
      await syncExamGroup(tx, user.id, id, examPartnerIds, pickExamFields({ ...data, ...text }));
      // A new room moves all upcoming events that still used the old (or no) room.
      if (data.room !== before.room) {
        await tx.calendarEvent.updateMany({
          where: {
            userId: user.id,
            moduleId: id,
            start: { gte: new Date() },
            OR: [{ location: null }, { location: "" }, ...(before.room ? [{ location: before.room }] : [])],
          },
          data: { location: data.room },
        });
      }
    });
    refresh();
  },
);

/** Autosave of the exam topics / notes. A shared exam has one text for all its modules. */
export const updateModuleExamText = authedAction(moduleExamTextSchema, async ({ id, ...text }, user) => {
  await ownedModule(user.id, id);
  const { examGroupId } = await db.module.findUniqueOrThrow({ where: { id }, select: { examGroupId: true } });
  await db.module.updateMany({ where: examGroupId ? { userId: user.id, examGroupId } : { userId: user.id, id }, data: text });
});

/** Autosave endpoint of the module's exam-prep note – content only, no revalidation needed. */
export const updateModuleSummaryNote = authedAction(moduleSummaryNoteSchema, async ({ id, summaryNote }, user) => {
  const { updatedAt } = await setSummaryNote(user.id, id, summaryNote);
  return { updatedAt: updatedAt.toISOString() };
});

export const deleteModule = authedAction(z.object({ id }), async ({ id }, user) => {
  await ownedModule(user.id, id);
  await deleteDocumentsWithFiles(user.id, { moduleId: id });
  await db.module.delete({ where: { id } });
  refresh();
});
