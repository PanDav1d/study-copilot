"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { gradeExam, isAnswered, parseExamText, parseStoredQuestions, type ExamAnswers } from "@/lib/exam";
import { XP } from "@/lib/gamification";
import { examAttemptSchema, examCreateSchema, examUpdateSchema, id } from "@/lib/validation";
import { authedAction, NotFoundError, UserError } from "../action";
import { reward } from "../gamification";
import { ownedModule } from "../ownership";

const refresh = () => revalidatePath("/", "layout");

async function ownedExam(userId: string, examId: string) {
  const exam = await db.exam.findFirst({ where: { id: examId, userId } });
  if (!exam) throw new NotFoundError("Probeklausur");
  return exam;
}

export const createExam = authedAction(examCreateSchema, async (input, user) => {
  await ownedModule(user.id, input.moduleId);
  const parsed = parseExamText(input.source);
  if (!parsed.ok) throw new UserError(parsed.errors.slice(0, 3).join(" · "));
  const mod = await db.module.findUniqueOrThrow({ where: { id: input.moduleId }, select: { name: true } });
  const exam = await db.exam.create({
    data: {
      userId: user.id,
      moduleId: input.moduleId,
      title: input.title || parsed.exam.title || `Probeklausur ${mod.name}`,
      timeLimit: input.timeLimit ?? parsed.exam.timeLimit,
      questions: JSON.stringify(parsed.exam.questions),
    },
  });
  refresh();
  return { id: exam.id };
});

export const updateExam = authedAction(examUpdateSchema, async ({ id, ...data }, user) => {
  await ownedExam(user.id, id);
  await db.exam.update({ where: { id }, data });
  refresh();
});

export const deleteExam = authedAction(z.object({ id }), async ({ id }, user) => {
  await ownedExam(user.id, id);
  await db.exam.delete({ where: { id } });
  refresh();
});

/** Stores a finished attempt. The score is recomputed on the server from the stored questions. */
export const submitAttempt = authedAction(examAttemptSchema, async (input, user) => {
  const exam = await ownedExam(user.id, input.examId);
  const questions = parseStoredQuestions(exam.questions);
  const answers: ExamAnswers = {};
  for (const q of questions) if (input.answers[q.id]) answers[q.id] = input.answers[q.id]!;
  const result = gradeExam(questions, answers);
  if (result.pending > 0) throw new UserError("Bewerte zuerst alle Freitextaufgaben.");

  const attempt = await db.examAttempt.create({
    data: {
      userId: user.id,
      examId: exam.id,
      answers: JSON.stringify(answers),
      score: result.earned,
      maxScore: result.max,
      durationSec: input.durationSec,
    },
  });
  const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const xp = Math.min(XP.examMax, answered * XP.examPerQuestion);
  refresh();
  return { id: attempt.id, reward: await reward(user.id, [{ amount: xp, reason: "exam", refId: attempt.id }]) };
});

export const deleteAttempt = authedAction(z.object({ id }), async ({ id }, user) => {
  const attempt = await db.examAttempt.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!attempt) throw new NotFoundError("Versuch");
  await db.examAttempt.delete({ where: { id } });
  refresh();
});
