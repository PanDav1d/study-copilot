"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedAction } from "../action";
import { createPlan, planTargets, previewPlan, type PlanInput } from "../services/study-plan";

const planSchema = z
  .object({
    mode: z.enum(["exam", "weekly"]).default("exam"),
    keys: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).max(40),
    dayStart: z.number().int().min(5).max(22),
    dayEnd: z.number().int().min(6).max(24),
    blockMinutes: z.number().int().min(30).max(180),
    maxPerDay: z.number().int().min(1).max(6),
    restDay: z.number().int().min(0).max(6).nullable(),
    leadDays: z.number().int().min(7).max(183).nullable().default(21),
    weeks: z.number().int().min(1).max(26).default(4),
    perWeek: z.number().int().min(1).max(3).default(1),
  })
  .refine((o) => o.dayEnd - o.dayStart >= 2, { message: "Das Zeitfenster muss mindestens 2 Stunden lang sein", path: ["dayEnd"] });

function toInput({ mode, keys, weeks, perWeek, ...options }: z.infer<typeof planSchema>): PlanInput {
  return { mode, keys, weeks, perWeek, options };
}

/** Exams and modules the dialog offers (loaded when it opens, so it works from anywhere). */
export const studyPlanTargets = authedAction(z.object({}), async (_input, user) => planTargets(user.id));

export const previewStudyPlan = authedAction(planSchema, async (input, user) => {
  const blocks = await previewPlan(user.id, toInput(input));
  return blocks.map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() }));
});

export const createStudyPlan = authedAction(planSchema, async (input, user) => {
  const result = await createPlan(user.id, toInput(input));
  revalidatePath("/", "layout");
  return result;
});
