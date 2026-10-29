/**
 * Practice exams (Probeklausuren). Exams are usually generated externally
 * (e.g. by an LLM from the student's own notes) and pasted in as JSON. This
 * module parses that text tolerantly, grades attempts and builds the prompt
 * used to generate an exam. Pure – shared by server and client.
 *
 * Why: practice testing under exam conditions is one of the most effective
 * learning techniques (testing effect) and reduces exam anxiety. Errors feed
 * straight back into spaced repetition as flashcards.
 */
import { z } from "zod";

export type QuestionType = "single" | "multiple" | "text";

export interface ExamQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  /** Answer options (choice questions only). */
  options: string[];
  /** Indices of the correct options (choice questions only). */
  correct: number[];
  /** Model solution (text) or extra solution notes. */
  answer: string;
  explanation: string;
  points: number;
  topic: string | null;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: "Single Choice",
  multiple: "Multiple Choice",
  text: "Freitext",
};

export const MAX_QUESTIONS = 200;
export const MAX_EXAM_SOURCE = 500_000;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const LETTERS = "ABCDEFGHIJ";
const str = (max: number) => z.string().trim().max(max);

const rawQuestion = z.object({
  type: z.enum(["single", "multiple", "text", "single_choice", "multiple_choice", "open", "freitext"]).optional(),
  question: str(20_000).min(1, "Fragetext fehlt").optional(),
  prompt: str(20_000).min(1).optional(),
  options: z.array(z.union([str(2_000), z.number()]).transform(String)).max(10, "Maximal 10 Antwortoptionen").optional(),
  correct: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional(),
  answer: str(50_000).optional(),
  solution: str(50_000).optional(),
  explanation: str(20_000).optional(),
  points: z.coerce.number().positive("Punkte müssen positiv sein").max(1000).optional(),
  topic: str(120).optional(),
});

const rawExam = z.object({
  title: str(160).optional(),
  timeLimit: z.coerce.number().int().min(1).max(600).optional(),
  questions: z.array(z.unknown()).min(1, "Keine Fragen gefunden").max(MAX_QUESTIONS, `Maximal ${MAX_QUESTIONS} Fragen`),
});

export interface ParsedExam {
  title: string | null;
  timeLimit: number | null;
  questions: ExamQuestion[];
}

export type ParseResult = { ok: true; exam: ParsedExam } | { ok: false; errors: string[] };

/** Extracts the JSON part of a pasted LLM answer (code fences, prose around it). */
export function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1]! : text).trim();
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const open = body[start]!;
  const end = body.lastIndexOf(open === "{" ? "}" : "]");
  if (end <= start) return null;
  return body.slice(start, end + 1);
}

function resolveCorrect(raw: unknown, options: string[]): number[] | string {
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const out: number[] = [];
  for (const item of list) {
    const s = String(item).trim();
    let index = -1;
    if (/^[A-Ja-j]$/.test(s)) index = LETTERS.indexOf(s.toUpperCase());
    else {
      index = options.findIndex((o) => o.trim().toLowerCase() === s.toLowerCase());
      if (index < 0 && /^\d+$/.test(s)) return `„${s}“ ist mehrdeutig – bitte Buchstaben (A, B, …) verwenden`;
    }
    if (index < 0 || index >= options.length) return `Lösung „${s}“ passt zu keiner Antwortoption`;
    if (!out.includes(index)) out.push(index);
  }
  return out.sort((a, b) => a - b);
}

function normaliseType(t: string | undefined, hasOptions: boolean, correctCount: number): QuestionType {
  if (t === "text" || t === "open" || t === "freitext") return "text";
  if (t === "multiple" || t === "multiple_choice") return "multiple";
  if (t === "single" || t === "single_choice") return "single";
  if (!hasOptions) return "text";
  return correctCount > 1 ? "multiple" : "single";
}

/** Parses pasted exam text. Error messages name the question, so they can be fixed quickly. */
export function parseExamText(text: string): ParseResult {
  if (text.length > MAX_EXAM_SOURCE) return { ok: false, errors: ["Der Text ist zu lang."] };
  const json = extractJson(text);
  if (!json) return { ok: false, errors: ["Kein JSON gefunden. Füge die Antwort der KI inklusive { … } ein."] };

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    // Second chance: typographic quotes (some chat UIs "smarten" them on copy) and trailing commas.
    try {
      data = JSON.parse(json.replace(/[“”„]/g, '"').replace(/,\s*([}\]])/g, "$1"));
    } catch (e) {
      return { ok: false, errors: [`Ungültiges JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  if (Array.isArray(data)) data = { questions: data };

  const exam = rawExam.safeParse(data);
  if (!exam.success) return { ok: false, errors: exam.error.issues.map((i) => i.message) };

  const errors: string[] = [];
  const questions: ExamQuestion[] = [];
  exam.data.questions.forEach((raw, i) => {
    const label = `Frage ${i + 1}`;
    const q = rawQuestion.safeParse(raw);
    if (!q.success) {
      errors.push(`${label}: ${q.error.issues[0]?.message ?? "ungültig"}`);
      return;
    }
    const prompt = q.data.question ?? q.data.prompt;
    if (!prompt) {
      errors.push(`${label}: Fragetext fehlt`);
      return;
    }
    const options = (q.data.options ?? []).map((o) => o.trim()).filter(Boolean);
    const correct = resolveCorrect(q.data.correct, options);
    if (typeof correct === "string") {
      errors.push(`${label}: ${correct}`);
      return;
    }
    const type = normaliseType(q.data.type, options.length > 0, correct.length);
    if (type !== "text") {
      if (options.length < 2) return void errors.push(`${label}: mindestens zwei Antwortoptionen nötig`);
      if (correct.length === 0) return void errors.push(`${label}: richtige Antwort fehlt („correct“)`);
      if (type === "single" && correct.length > 1) return void errors.push(`${label}: Single Choice mit mehreren Lösungen – „type“: „multiple“ verwenden`);
    }
    const answer = q.data.answer ?? q.data.solution ?? "";
    if (type === "text" && !answer) return void errors.push(`${label}: Musterlösung fehlt („answer“)`);
    questions.push({
      id: `q${i + 1}`,
      type,
      prompt,
      options: type === "text" ? [] : options,
      correct: type === "text" ? [] : correct,
      answer,
      explanation: q.data.explanation ?? "",
      points: q.data.points ?? (type === "text" ? 4 : 1),
      topic: q.data.topic || null,
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, exam: { title: exam.data.title || null, timeLimit: exam.data.timeLimit ?? null, questions } };
}

/** Questions as stored in the DB (already normalised – parsed defensively). */
export function parseStoredQuestions(json: string): ExamQuestion[] {
  try {
    const data = JSON.parse(json);
    return Array.isArray(data) ? (data as ExamQuestion[]) : [];
  } catch {
    return [];
  }
}

export function optionLetter(i: number) {
  return LETTERS[i] ?? String(i + 1);
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface QuestionAnswer {
  choice?: number[];
  text?: string;
  /** Self-assessed points for text questions (compare with the model solution). */
  self?: number;
}
export type ExamAnswers = Record<string, QuestionAnswer>;

export type QuestionStatus = "correct" | "partial" | "wrong" | "unanswered" | "pending";

export function isAnswered(q: ExamQuestion, a: QuestionAnswer | undefined) {
  if (!a) return false;
  return q.type === "text" ? !!a.text?.trim() : (a.choice?.length ?? 0) > 0;
}

/** Multiple choice uses partial credit: (right − wrong) / #correct, never below 0. */
export function gradeQuestion(q: ExamQuestion, a: QuestionAnswer | undefined): { earned: number; status: QuestionStatus } {
  if (!isAnswered(q, a)) return { earned: 0, status: "unanswered" };
  let earned: number;
  if (q.type === "text") {
    if (a!.self === undefined) return { earned: 0, status: "pending" };
    earned = Math.min(q.points, Math.max(0, a!.self));
  } else if (q.type === "single") {
    earned = q.correct.includes(a!.choice![0]!) ? q.points : 0;
  } else {
    const chosen = new Set(a!.choice);
    const right = q.correct.filter((c) => chosen.has(c)).length;
    const wrong = [...chosen].filter((c) => !q.correct.includes(c)).length;
    earned = q.points * Math.max(0, (right - wrong) / q.correct.length);
  }
  earned = Math.round(earned * 100) / 100;
  const status: QuestionStatus = earned >= q.points ? "correct" : earned > 0 ? "partial" : "wrong";
  return { earned, status };
}

/** German grade (1,0 – 5,0) from a percentage, common university scale: 50 % = 4,0. */
export function germanGrade(percent: number) {
  const steps: [number, number][] = [
    [95, 1.0], [90, 1.3], [85, 1.7], [80, 2.0], [75, 2.3], [70, 2.7], [65, 3.0], [60, 3.3], [55, 3.7], [50, 4.0],
  ];
  for (const [min, grade] of steps) if (percent >= min) return grade;
  return 5.0;
}

export function fmtGrade(g: number) {
  return g.toFixed(1).replace(".", ",");
}

export function gradeExam(questions: ExamQuestion[], answers: ExamAnswers) {
  const results = questions.map((q) => ({ id: q.id, ...gradeQuestion(q, answers[q.id]), points: q.points }));
  const max = questions.reduce((s, q) => s + q.points, 0);
  const earned = Math.round(results.reduce((s, r) => s + r.earned, 0) * 100) / 100;
  const percent = max > 0 ? (earned / max) * 100 : 0;
  const topics = new Map<string, { earned: number; max: number }>();
  questions.forEach((q, i) => {
    const key = q.topic ?? "Ohne Thema";
    const t = topics.get(key) ?? { earned: 0, max: 0 };
    t.earned += results[i]!.earned;
    t.max += q.points;
    topics.set(key, t);
  });
  return {
    results,
    earned,
    max,
    percent,
    grade: germanGrade(percent),
    pending: results.filter((r) => r.status === "pending").length,
    topics: [...topics].map(([topic, t]) => ({ topic, ...t, percent: t.max ? (t.earned / t.max) * 100 : 0 })).sort((a, b) => a.percent - b.percent),
  };
}

/** A missed question as flashcard draft (errors → spaced repetition). */
export function questionToCard(q: ExamQuestion) {
  const options = q.options.map((o, i) => `${optionLetter(i)}) ${o}`).join("\n");
  const front = q.type === "text" ? q.prompt : `${q.prompt}\n\n${options}`;
  const solution =
    q.type === "text" ? q.answer : q.correct.map((c) => `**${optionLetter(c)})** ${q.options[c]}`).join("\n\n") + (q.answer ? `\n\n${q.answer}` : "");
  const back = q.explanation ? `${solution}\n\n---\n\n${q.explanation}` : solution;
  return { front: front.slice(0, 5_000), back: back.slice(0, 20_000) };
}

// ---------------------------------------------------------------------------
// Prompt for external generation
// ---------------------------------------------------------------------------

export interface ExamPromptContext {
  moduleName: string;
  examType: string | null;
  examDuration: number | null;
  examTopics: string;
  /** Session notes (cues, notes, summary) as plain text. */
  notes: string;
}

export interface ExamPromptOptions {
  questionCount: number;
  difficulty: "leicht" | "mittel" | "schwer";
  includeNotes: boolean;
}

export const EXAM_PROMPT_NOTES_LIMIT = 60_000;

export function buildExamPrompt(ctx: ExamPromptContext, opts: ExamPromptOptions) {
  const lines = [
    `Erstelle eine realistische Probeklausur für das Hochschulmodul „${ctx.moduleName}“ (DHBW).`,
    ctx.examType ? `Prüfungsform: ${ctx.examType}${ctx.examDuration ? `, ${ctx.examDuration} Minuten` : ""}.` : "",
    `Anzahl Aufgaben: ${opts.questionCount}. Schwierigkeit: ${opts.difficulty}.`,
    "Mische Single Choice, Multiple Choice und Freitextaufgaben (Verständnis, Anwendung, Transfer – nicht nur Definitionen).",
    "Punkte nach Aufwand vergeben. Erkläre bei jeder Aufgabe kurz, warum die Lösung richtig ist.",
    ctx.examTopics.trim() ? `\nPrüfungsrelevante Inhalte:\n${ctx.examTopics.trim()}` : "",
    opts.includeNotes && ctx.notes.trim()
      ? `\nGrundlage sind meine Vorlesungsnotizen (Cornell: Frage → Notiz, Zusammenfassung):\n"""\n${ctx.notes.trim().slice(0, EXAM_PROMPT_NOTES_LIMIT)}\n"""`
      : "",
    "",
    "Antworte NUR mit JSON in genau diesem Format (keine weiteren Erklärungen):",
    "```json",
    JSON.stringify(
      {
        title: `Probeklausur ${ctx.moduleName}`,
        timeLimit: ctx.examDuration ?? 60,
        questions: [
          { type: "single", question: "Fragetext (Markdown erlaubt)", options: ["…", "…", "…", "…"], correct: "B", points: 2, topic: "Thema", explanation: "Warum B richtig ist" },
          { type: "multiple", question: "…", options: ["…", "…", "…", "…"], correct: ["A", "C"], points: 3, topic: "Thema", explanation: "…" },
          { type: "text", question: "…", answer: "Musterlösung mit Bewertungskriterien", points: 6, topic: "Thema" },
        ],
      },
      null,
      2,
    ),
    "```",
    "Regeln: „correct“ verwendet Buchstaben (A = erste Option). „timeLimit“ in Minuten. Keine Kommentare im JSON.",
  ];
  return lines.filter((l) => l !== "").join("\n");
}
