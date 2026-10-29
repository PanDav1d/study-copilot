import "server-only";
import { db } from "@/lib/db";
import { EXAM_TYPES, type ExamType } from "@/lib/constants";
import { parseRows } from "@/lib/cornell";
import { parseStoredQuestions, type ExamAnswers, type ExamPromptContext } from "@/lib/exam";
import { fmtDate } from "@/lib/dates";
import { sessionTitle } from "@/lib/labels";

export async function listExams(userId: string, moduleId?: string) {
  const exams = await db.exam.findMany({
    where: { userId, ...(moduleId ? { moduleId } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      timeLimit: true,
      questions: true,
      createdAt: true,
      module: { select: { id: true, name: true, color: true, examDate: true } },
      attempts: { orderBy: { createdAt: "desc" }, select: { id: true, score: true, maxScore: true, createdAt: true } },
    },
  });
  return exams.map(({ questions, attempts, ...e }) => {
    const qs = parseStoredQuestions(questions);
    const percents = attempts.map((a) => (a.maxScore ? (a.score / a.maxScore) * 100 : 0));
    return {
      ...e,
      questionCount: qs.length,
      maxPoints: qs.reduce((s, q) => s + q.points, 0),
      attemptCount: attempts.length,
      best: percents.length ? Math.max(...percents) : null,
      last: percents[0] ?? null,
      lastAt: attempts[0]?.createdAt ?? null,
    };
  });
}
export type ExamListItem = Awaited<ReturnType<typeof listExams>>[number];

export async function getExam(userId: string, id: string) {
  const exam = await db.exam.findFirst({
    where: { id, userId },
    include: {
      module: { select: { id: true, name: true, color: true } },
      attempts: { orderBy: { createdAt: "desc" }, select: { id: true, score: true, maxScore: true, durationSec: true, createdAt: true } },
    },
  });
  if (!exam) return null;
  return { ...exam, questions: parseStoredQuestions(exam.questions) };
}

export async function getAttempt(userId: string, examId: string, attemptId: string) {
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, examId, userId } });
  if (!attempt) return null;
  let answers: ExamAnswers = {};
  try {
    answers = JSON.parse(attempt.answers) as ExamAnswers;
  } catch {}
  return { ...attempt, answers };
}

/** Everything an external LLM needs to write a good exam for this module. */
export async function examPromptContext(userId: string, moduleId: string): Promise<ExamPromptContext | null> {
  const mod = await db.module.findFirst({
    where: { id: moduleId, userId },
    select: {
      name: true,
      examType: true,
      examDuration: true,
      examTopics: true,
      examGroupId: true,
      notes: { orderBy: { date: "asc" }, select: { title: true, date: true, sections: true, summary: true } },
    },
  });
  if (!mod) return null;
  // A shared exam covers the sessions of all its modules.
  const partners = mod.examGroupId
    ? await db.module.findMany({
        where: { userId, examGroupId: mod.examGroupId, id: { not: moduleId } },
        select: { name: true, notes: { orderBy: { date: "asc" }, select: { title: true, date: true, sections: true, summary: true } } },
      })
    : [];
  const notes = [...mod.notes, ...partners.flatMap((p) => p.notes)]
    .map((n) => {
      const rows = parseRows(n.sections)
        .filter((r) => r.cue.trim() || r.content.trim())
        .map((r) => (r.cue.trim() ? `- ${r.cue.trim()} → ${r.content.trim()}` : `- ${r.content.trim()}`));
      if (!rows.length && !n.summary.trim()) return "";
      const head = `## ${sessionTitle(n)} (${fmtDate(n.date)})`;
      return [head, ...rows, n.summary.trim() ? `Zusammenfassung: ${n.summary.trim()}` : ""].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  return {
    moduleName: [mod.name, ...partners.map((p) => p.name)].join(" + "),
    examType: mod.examType ? EXAM_TYPES[mod.examType as ExamType] : null,
    examDuration: mod.examDuration,
    examTopics: mod.examTopics,
    notes,
  };
}
