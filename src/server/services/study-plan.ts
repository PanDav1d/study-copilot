import "server-only";
import { randomUUID } from "node:crypto";
import { addDays, addMinutes, startOfDay, startOfWeek } from "date-fns";
import { db } from "@/lib/db";
import {
  PLAN_HORIZON_DAYS,
  PLANNABLE_EXAM_TYPES,
  planStudy,
  planWeekly,
  type PlanExam,
  type PlanMode,
  type PlanModule,
  type PlanOptions,
} from "@/lib/study-plan";
import { mergeSharedExams } from "../queries/calendar";

export interface PlanInput {
  mode: PlanMode;
  /** Exam keys (exam phase) or module ids (weekly). */
  keys: string[];
  options: Omit<PlanOptions, "now">;
  weeks: number;
  perWeek: number;
}

/** Upcoming exams that can be planned for – shared exams once. */
export async function plannableExams(userId: string, now = new Date()) {
  const modules = await db.module.findMany({
    where: { userId, examDate: { gt: now, lte: addDays(now, PLAN_HORIZON_DAYS) } },
    orderBy: [{ examDate: "asc" }, { name: "asc" }],
    select: { id: true, name: true, color: true, examDate: true, examType: true, examDuration: true, examGroupId: true, ects: true },
  });
  const members = (m: (typeof modules)[number]) => (m.examGroupId ? modules.filter((x) => x.examGroupId === m.examGroupId).map((x) => x.id) : [m.id]);
  return mergeSharedExams(modules)
    .filter((m) => !m.examType || PLANNABLE_EXAM_TYPES.has(m.examType))
    .map((m) => ({
      key: m.examGroupId ?? m.id,
      moduleId: m.id,
      moduleIds: members(m),
      name: m.name,
      color: m.color,
      examDate: m.examDate!,
      examType: m.examType,
      examDuration: m.examDuration,
      ects: m.ects,
    }));
}

/** Modules of the semesters that are still running (all modules if no semester has dates). */
export async function plannableModules(userId: string, now = new Date()) {
  const select = { id: true, name: true, color: true, ects: true, examDate: true, semester: { select: { name: true } } } as const;
  const running = await db.module.findMany({
    where: { userId, semester: { OR: [{ endDate: null }, { endDate: { gte: startOfDay(now) } }] } },
    orderBy: [{ semester: { startDate: "desc" } }, { name: "asc" }],
    select,
  });
  const modules = running.length ? running : await db.module.findMany({ where: { userId }, orderBy: { name: "asc" }, select });
  return modules.map((m) => ({ key: m.id, moduleId: m.id, name: m.name, color: m.color, ects: m.ects, examDate: m.examDate && m.examDate > now ? m.examDate : null, semester: m.semester.name }));
}

/** Everything the plan dialog offers. */
export async function planTargets(userId: string) {
  const now = new Date();
  const [exams, modules] = await Promise.all([plannableExams(userId, now), plannableModules(userId, now)]);
  return { exams, modules };
}

/** Computes the plan for the selected exams / modules around everything already in the calendar. */
export async function previewPlan(userId: string, input: PlanInput) {
  const now = new Date();
  const opts = { ...input.options, now };
  if (input.mode === "weekly") {
    const all = await plannableModules(userId, now);
    const modules: PlanModule[] = all.filter((m) => input.keys.includes(m.key));
    if (modules.length === 0) return [];
    const until = addDays(startOfWeek(now, { weekStartsOn: 1 }), 7 * input.weeks);
    return planWeekly(modules, await busyTimes(userId, now, until), { ...opts, weeks: input.weeks, perWeek: input.perWeek });
  }
  const all = await plannableExams(userId, now);
  const exams: PlanExam[] = all.filter((e) => input.keys.includes(e.key));
  if (exams.length === 0) return [];
  const until = new Date(Math.max(...exams.map((e) => e.examDate.getTime())));
  const busy = [
    ...(await busyTimes(userId, now, until)),
    // Every exam blocks its own time slot, also for the other modules.
    ...all.map((e) => ({ start: e.examDate, end: addMinutes(e.examDate, e.examDuration ?? 120) })),
  ];
  return planStudy(exams, busy, opts);
}

async function busyTimes(userId: string, from: Date, until: Date) {
  const events = await db.calendarEvent.findMany({
    where: { userId, start: { lt: until }, end: { gte: from } },
    select: { start: true, end: true, allDay: true, type: true, moduleId: true },
  });
  return events.map((e) => ({
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    studyModuleId: e.type === "STUDY" ? e.moduleId : null,
    lectureModuleId: e.type === "LECTURE" ? e.moduleId : null,
  }));
}

/** Writes the plan as study sessions. One series id, so the whole plan can be removed at once. */
export async function createPlan(userId: string, input: PlanInput) {
  const blocks = await previewPlan(userId, input);
  const seriesId = randomUUID();
  await db.calendarEvent.createMany({
    data: blocks.map((b) => ({
      userId,
      type: "STUDY",
      title: b.title,
      description: b.description,
      start: b.start,
      end: b.end,
      moduleId: b.moduleId,
      seriesId,
    })),
  });
  return { count: blocks.length };
}
