import { z } from "zod";
import { EVENT_TYPE_KEYS, EXAM_TYPE_KEYS, MODULE_COLOR_KEYS } from "./constants";
import { cornellRowsSchema } from "./cornell";
import { parseLocalDate } from "./dates";
import { MAX_EXAM_SOURCE, MAX_QUESTIONS } from "./exam";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const id = z.string().min(1).max(64).regex(/^[a-z0-9]+$/i, "Ungültige ID");
const optionalId = z.preprocess(emptyToUndefined, id.optional().nullable()).transform((v) => v ?? null);

const text = (max: number) => z.string().trim().max(max, `Maximal ${max} Zeichen`);
const requiredText = (max: number, label: string) => text(max).min(1, `${label} ist erforderlich`);
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, text(max).optional().nullable()).transform((v) => v ?? null);

/** Long markdown body (notes etc.) – generous but bounded. */
const markdownText = z.string().max(200_000, "Text ist zu lang");
const markdown = markdownText.default("");

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Ungültiges Datum")
  .transform((v, ctx) => {
    const d = parseLocalDate(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Ungültiges Datum" });
      return z.NEVER;
    }
    return d;
  });
const optionalDate = z.preprocess(emptyToUndefined, localDate.optional().nullable()).transform((v) => v ?? null);

const optionalInt = (min: number, max: number) =>
  z
    .preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional().nullable())
    .transform((v) => v ?? null);

// --- Auth -------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Ungültige E-Mail-Adresse")),
  password: z.string().min(1, "Passwort ist erforderlich").max(256),
});

export const passwordRule = z
  .string()
  .min(10, "Mindestens 10 Zeichen")
  .max(256, "Maximal 256 Zeichen");

export const registerSchema = loginSchema.extend({
  name: requiredText(80, "Name"),
  password: passwordRule,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Aktuelles Passwort ist erforderlich"),
  newPassword: passwordRule,
});

export const settingsSchema = z.object({
  name: requiredText(80, "Name"),
  requestRetention: z.coerce.number().min(0.7, "Mindestens 70 %").max(0.98, "Höchstens 98 %"),
  maximumInterval: z.coerce.number().int().min(7).max(36500),
  enableFuzz: z.coerce.boolean(),
  dailyNewLimit: z.coerce.number().int().min(0).max(500),
  dailyXpGoal: z.coerce.number().int().min(10).max(1000),
});

// --- Study structure ----------------------------------------------------------

export const semesterSchema = z
  .object({
    name: requiredText(80, "Name"),
    number: optionalInt(1, 20),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine((s) => !s.startDate || !s.endDate || s.endDate >= s.startDate, {
    message: "Ende muss nach dem Beginn liegen",
    path: ["endDate"],
  });

export const moduleSchema = z.object({
  semesterId: id,
  name: requiredText(120, "Name"),
  code: optionalText(40),
  lecturer: optionalText(120),
  ects: optionalInt(0, 60),
  color: z.enum(MODULE_COLOR_KEYS).default("indigo"),
  description: markdown,
  room: optionalText(80),
  examDate: optionalDate,
  examType: z.preprocess(emptyToUndefined, z.enum(EXAM_TYPE_KEYS).optional().nullable()).transform((v) => v ?? null),
  examDuration: optionalInt(0, 10_000),
  examLocation: optionalText(120),
  /** Edited in the module's "Prüfung" tab – left out, they stay as they are. */
  examTopics: markdownText.optional(),
  examNotes: markdownText.optional(),
  /** Other modules that end in the same exam (e.g. "Mathematik I + II"). */
  examPartnerIds: z.array(id).max(20).default([]),
});

/** Exam topics (checklist) and notes, autosaved from the module's "Prüfung" tab. */
export const moduleExamTextSchema = z.object({
  id,
  examTopics: markdownText.optional(),
  examNotes: markdownText.optional(),
});

/** The module's free-form exam-prep note (autosaved). */
export const moduleSummaryNoteSchema = z.object({
  id,
  summaryNote: z.string().max(200_000, "Text ist zu lang"),
});

// --- Notes --------------------------------------------------------------------

/** A session (Sitzung) = one Cornell note per lecture day. The topic is optional. */
export const noteCreateSchema = z.object({
  moduleId: id,
  title: text(160).default(""),
  date: localDate,
  eventId: optionalId,
});

export const noteUpdateSchema = z.object({
  id,
  title: text(160).optional(),
  date: localDate.optional(),
  sections: cornellRowsSchema.optional(),
  summary: z.string().max(50_000).optional(),
});

// --- Flashcards ---------------------------------------------------------------

export const flashcardSchema = z.object({
  moduleId: id,
  noteId: optionalId,
  front: requiredText(5_000, "Vorderseite"),
  back: requiredText(20_000, "Rückseite"),
  topic: optionalText(80),
  documentIds: z.array(id).max(20).default([]),
});

export const flashcardBulkSchema = z.object({
  moduleId: id,
  noteId: optionalId,
  topic: optionalText(80),
  cards: z
    .array(z.object({ front: requiredText(5_000, "Vorderseite"), back: requiredText(20_000, "Rückseite") }))
    .min(1, "Keine Karteikarten ausgewählt")
    .max(200),
});

export const recallSchema = z.object({
  noteId: id,
  known: z.coerce.number().int().min(0).max(500),
  total: z.coerce.number().int().min(1).max(500),
});

export const reviewSchema = z.object({
  flashcardId: id,
  rating: z.coerce.number().int().min(1).max(4),
  durationMs: z.coerce.number().int().min(0).max(3_600_000).optional(),
});

// --- Calendar -----------------------------------------------------------------

export const eventSchema = z
  .object({
    type: z.enum(EVENT_TYPE_KEYS),
    title: requiredText(160, "Titel"),
    description: markdown,
    location: optionalText(160),
    start: localDate,
    end: localDate,
    allDay: z.coerce.boolean().default(false),
    moduleId: optionalId,
    noteId: optionalId,
    documentId: optionalId,
    topic: optionalText(80),
    repeatWeeks: z.coerce.number().int().min(0).max(30).default(0),
    /** For lectures: create a session (Cornell note) for every occurrence. */
    createSession: z.coerce.boolean().default(false),
  })
  .refine((e) => e.end >= e.start, { message: "Ende muss nach dem Beginn liegen", path: ["end"] });

export const MAX_IMPORT_EVENTS = 3000;

/** Bulk import (iCal): occurrences already parsed and assigned in the browser. */
export const eventImportSchema = z.object({
  events: z
    .array(
      z
        .object({
          externalId: z.string().min(1).max(300),
          type: z.enum(EVENT_TYPE_KEYS),
          title: requiredText(160, "Titel"),
          description: z.string().max(5_000).default(""),
          location: optionalText(160),
          start: z.coerce.date(),
          end: z.coerce.date(),
          allDay: z.boolean().default(false),
          moduleId: optionalId,
        })
        .refine((e) => e.end >= e.start, { message: "Ende muss nach dem Beginn liegen", path: ["end"] }),
    )
    .min(1, "Keine Termine ausgewählt")
    .max(MAX_IMPORT_EVENTS, `Höchstens ${MAX_IMPORT_EVENTS} Termine auf einmal`),
  /** Create an empty session (Cornell note) for each imported lecture without one. */
  createSessions: z.boolean().default(false),
});

export const calendarUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2_000)
    .transform((u) => u.replace(/^webcals?:\/\//i, "https://"))
    .pipe(z.url({ protocol: /^https?$/, message: "Bitte einen http(s)- oder webcal-Link angeben" })),
});

// --- Documents ----------------------------------------------------------------

export const documentUpdateSchema = z.object({
  id,
  title: requiredText(160, "Titel"),
  description: z.string().max(5_000).default(""),
  semesterId: optionalId,
  moduleId: optionalId,
});

// --- Practice exams -------------------------------------------------------------

export const examCreateSchema = z.object({
  moduleId: id,
  title: text(160).default(""),
  timeLimit: optionalInt(1, 600),
  source: z.string().min(1, "Füge die Probeklausur ein").max(MAX_EXAM_SOURCE, "Der Text ist zu lang"),
});

export const examUpdateSchema = z.object({
  id,
  title: requiredText(160, "Titel"),
  timeLimit: optionalInt(1, 600),
});

const questionAnswer = z.object({
  choice: z.array(z.number().int().min(0).max(9)).max(10).optional(),
  text: z.string().max(50_000).optional(),
  self: z.number().min(0).max(1000).optional(),
});

export const examAttemptSchema = z.object({
  examId: id,
  durationSec: z.number().int().min(0).max(7 * 86_400),
  answers: z.record(z.string().max(16), questionAnswer).refine((a) => Object.keys(a).length <= MAX_QUESTIONS, "Zu viele Antworten"),
});

export type FieldErrors = Record<string, string[] | undefined>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
