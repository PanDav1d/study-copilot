import { addDays, addMinutes, differenceInCalendarDays, isSameDay, startOfDay, startOfWeek } from "date-fns";

/**
 * Study planner. Two plans, both following what learning research recommends:
 *
 * Exam phase (Klausurenphase) – at the DHBW the exams of a theory phase come in
 * a dense block right after the lectures, so cramming per exam does not work:
 * - Distributed practice (Cepeda et al. 2006): several sessions per module
 *   spread over the weeks before instead of one long one at the end. The start
 *   is free (default three weeks before); the earlier, the more light
 *   refresher rounds with gaps that grow with the distance to the exam.
 * - Successive relearning (Rawson & Dunlosky 2011): every session is
 *   retrieval until each item was answered correctly once – repeated across days.
 * - Interleaving (Rohrer & Taylor 2007): modules are mixed on the same day,
 *   never two sessions of the same module on one day.
 * - Transfer-appropriate practice: a full mock exam under exam conditions a
 *   few days before, early enough to fix the gaps it reveals.
 * - Sleep consolidates (Diekelmann & Born 2010): the last session is short,
 *   no new material, early to bed.
 *
 * Weekly rhythm (during the semester, also without exam dates): one short
 * review per module and week, right after its lecture – retrieval while it is
 * still fresh, so the exam phase is relearning instead of learning.
 *
 * Pure (no DB): the server feeds exams and busy times, the result is a preview
 * the user confirms before anything is written.
 */

export type BlockKind = "spaced" | "overview" | "retrieval" | "mock" | "final" | "weekly";
export type PlanMode = "exam" | "weekly";

export interface PlanExam {
  /** Exam group id or module id – modules with a shared exam are planned once. */
  key: string;
  moduleId: string;
  name: string;
  examDate: Date;
  examType: string | null;
  ects: number | null;
}

export interface PlanModule {
  key: string;
  moduleId: string;
  name: string;
  ects: number | null;
  /** No weekly reviews on or after the exam. */
  examDate: Date | null;
}

export interface BusyTime {
  start: Date;
  end: Date;
  allDay?: boolean;
  /** Existing study sessions of a module count as already planned. */
  studyModuleId?: string | null;
  /** Lectures anchor the weekly review (the day after). */
  lectureModuleId?: string | null;
}

export interface PlanOptions {
  /** Earliest moment a block may start (usually now). */
  now: Date;
  /** Daily window, hours (local time). */
  dayStart: number;
  dayEnd: number;
  blockMinutes: number;
  maxPerDay: number;
  /** Weekday kept free (0 = Sunday), or null. Rest days are part of the plan. */
  restDay: number | null;
  /** Exam phase: start this many days before each exam; null = as early as possible (from today). */
  leadDays: number | null;
}

export interface WeeklyOptions extends PlanOptions {
  weeks: number;
  /** Reviews per module and week. */
  perWeek: number;
}

export interface PlannedBlock {
  /** Exam key (exam phase) or module key (weekly). */
  examKey: string;
  moduleId: string;
  kind: BlockKind;
  title: string;
  description: string;
  start: Date;
  end: Date;
  /** Days before the exam (null for weekly reviews). */
  daysBefore: number | null;
}

export const DEFAULT_PLAN_OPTIONS: Omit<PlanOptions, "now"> = { dayStart: 9, dayEnd: 19, blockMinutes: 90, maxPerDay: 3, restDay: 0, leadDays: 21 };
export const DEFAULT_WEEKLY = { weeks: 4, perWeek: 1 };

/** Exam types that are learned for (a term paper or project needs a different plan). */
export const PLANNABLE_EXAM_TYPES = new Set(["KLAUSUR", "MUENDLICH", "LABOR", "SONSTIGE"]);
/** Exams further away than this are not offered (half a year covers every theory phase). */
export const PLAN_HORIZON_DAYS = 183;

/** Start of the preparation, days before the exam (null = as early as possible). */
export const LEAD_OPTIONS: { value: number | null; label: string }[] = [
  { value: 14, label: "2 Wochen vorher" },
  { value: 21, label: "3 Wochen vorher (empfohlen)" },
  { value: 28, label: "4 Wochen vorher" },
  { value: 42, label: "6 Wochen vorher" },
  { value: 56, label: "8 Wochen vorher" },
  { value: null, label: "So früh wie möglich (ab heute)" },
];

/**
 * Days before the exam with a session, nearest first: dense at the end, the gaps
 * grow with the distance (expanding retrieval practice). Small modules
 * (≤ 4 ECTS) get fewer sessions.
 */
const OFFSETS_LARGE = [1, 2, 3, 5, 7, 10, 13, 17, 21, 26, 32, 39, 47, 56, 66, 77, 89, 102, 116, 131, 147, 164, 182];
const OFFSETS_SMALL = [1, 3, 5, 7, 13, 21, 30, 42, 56, 72, 90, 110, 132, 156, 182];

const GAP_MIN = 15;
const STEP_MIN = 30;

/** Session days before the exam, furthest first, for a preparation that starts `lead` days before. */
export function offsetsFor(exam: Pick<PlanExam, "ects">, lead = DEFAULT_PLAN_OPTIONS.leadDays ?? 21) {
  const base = exam.ects !== null && exam.ects <= 4 ? OFFSETS_SMALL : OFFSETS_LARGE;
  const offsets = base.filter((d) => d <= lead).reverse();
  // The preparation starts on its first day, not a few days later.
  if (offsets.length > 0 && lead - offsets[0]! >= 3) offsets.unshift(lead);
  return offsets;
}

export function kindFor(daysBefore: number): BlockKind {
  if (daysBefore > 21) return "spaced";
  if (daysBefore >= 10) return "overview";
  if (daysBefore === 3) return "mock";
  if (daysBefore === 1) return "final";
  return "retrieval";
}

export const KIND_LABELS: Record<BlockKind, string> = {
  spaced: "Auffrischen",
  overview: "Überblick & Lücken",
  retrieval: "Abrufen",
  mock: "Generalprobe",
  final: "Letzte Runde",
  weekly: "Wochenrückblick",
};

export function blockDescription(kind: BlockKind, examType: string | null) {
  const oral = examType === "MUENDLICH";
  switch (kind) {
    case "spaced":
      return [
        "**Auffrischen – kurz und regelmäßig**",
        "1. Die fälligen Karten des Moduls lernen.",
        "2. Eine ältere Sitzung im Modus *Abfragen* durchgehen.",
        "3. Neue Lücken sofort zu Karteikarten machen.",
        "",
        "_Früh und verteilt wiederholen: Jede Runde macht die nächste leichter._",
      ].join("\n");
    case "overview":
      return [
        "**Überblick & Lücken schließen**",
        "1. Sitzungen des Moduls im Modus *Abfragen* durchgehen – erst antworten, dann aufdecken.",
        "2. Lücken sofort zu Karteikarten machen.",
        "3. Zum Schluss die fälligen Karten des Moduls lernen.",
        "",
        "_Verteilt lernen: mehrere kurze Runden über Wochen schlagen eine lange am Ende._",
      ].join("\n");
    case "retrieval":
      return [
        "**Abrufen statt Lesen**",
        "1. Prüfungsmodus des Moduls, bis jede Karte einmal gewusst wurde.",
        oral ? "2. Zwei Themen laut erklären, ohne Unterlagen – dann prüfen." : "2. Zwei, drei Aufgaben ohne Unterlagen lösen – dann prüfen.",
        "3. Fehler → Karteikarte.",
        "",
        "_Abfragen bringt deutlich mehr als nochmal Lesen – auch wenn es sich schwerer anfühlt._",
      ].join("\n");
    case "mock":
      return oral
        ? [
            "**Generalprobe: Prüfungsgespräch**",
            "1. Prüfungsinhalte der Reihe nach laut erklären (jemandem oder dir selbst), ohne Unterlagen.",
            "2. Was holprig war → Karteikarten.",
            "",
            "_Prüfungsnah üben macht Wissen in der Prüfung abrufbar und nimmt die Nervosität._",
          ].join("\n")
        : [
            "**Generalprobe unter Prüfungsbedingungen**",
            "1. Probeklausur mit Zeitlimit, ohne Unterlagen.",
            "2. Ehrlich bewerten, Fehler mit einem Klick zu Karteikarten machen.",
            "",
            "_Drei Tage vorher – genug Zeit, die Lücken noch zu schließen._",
          ].join("\n");
    case "final":
      return [
        "**Letzte Runde – kurz halten**",
        "1. Nur die schwächsten Karten (Prüfungsmodus).",
        "2. Kein neuer Stoff mehr.",
        "3. Früh schlafen: Im Schlaf wird gefestigt, was du gelernt hast.",
      ].join("\n");
    case "weekly":
      return [
        "**Wochenrückblick**",
        "1. Die Sitzungen dieser Woche im Modus *Abfragen* durchgehen – erst antworten, dann aufdecken.",
        "2. Fehlende Zusammenfassungen schreiben: 3–5 Sätze, ohne in die Notizen zu schauen.",
        "3. Lücken → Karteikarten, danach die fälligen Karten des Moduls.",
        "",
        "_Wer jede Woche kurz nacharbeitet, muss in der Klausurenphase nichts neu lernen._",
      ].join("\n");
  }
}

function minutesFor(kind: BlockKind, blockMinutes: number) {
  if (kind === "final") return Math.min(blockMinutes, 45);
  if (kind === "spaced" || kind === "weekly") return Math.min(blockMinutes, 60);
  if (kind === "mock") return Math.max(blockMinutes, 120);
  return blockMinutes;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date, gapMin: number) {
  return aStart < addMinutes(bEnd, gapMin) && bStart < addMinutes(aEnd, gapMin);
}

/** First free start on `day` within the window, or null. */
function findSlot(day: Date, minutes: number, opts: PlanOptions, taken: { start: Date; end: Date }[]): Date | null {
  const base = startOfDay(day);
  for (let m = opts.dayStart * 60; m + minutes <= opts.dayEnd * 60; m += STEP_MIN) {
    const start = addMinutes(base, m);
    if (start < opts.now) continue;
    const end = addMinutes(start, minutes);
    if (!taken.some((t) => overlaps(start, end, t.start, t.end, GAP_MIN))) return start;
  }
  return null;
}

export function planStudy(exams: PlanExam[], busy: BusyTime[], opts: PlanOptions): PlannedBlock[] {
  const today = startOfDay(opts.now);
  const timed = busy.filter((b) => !b.allDay);
  const placed: PlannedBlock[] = [];
  const examDays = exams.map((e) => startOfDay(e.examDate));

  // Desired sessions, nearest exams first so they get the best slots.
  const wanted = [...exams]
    .sort((a, b) => a.examDate.getTime() - b.examDate.getTime())
    .flatMap((exam) => {
      const daysLeft = differenceInCalendarDays(startOfDay(exam.examDate), today);
      const lead = Math.min(opts.leadDays ?? daysLeft, daysLeft);
      return offsetsFor(exam, lead).map((daysBefore, i) => {
        // Every preparation opens with an overview of the whole module.
        const kind = i === 0 && daysBefore > 3 ? "overview" : kindFor(daysBefore);
        return { exam, daysBefore, kind };
      });
    });
  wanted.sort((a, b) => b.daysBefore - a.daysBefore || a.exam.examDate.getTime() - b.exam.examDate.getTime());

  for (const { exam, daysBefore, kind } of wanted) {
    const examDay = startOfDay(exam.examDate);
    const target = addDays(examDay, -daysBefore);
    // Already covered by a study session the user planned on that day.
    if (busy.some((b) => b.studyModuleId === exam.moduleId && isSameDay(b.start, target))) continue;

    const minutes = minutesFor(kind, opts.blockMinutes);
    // Nearby days if the target day does not work – but never on or after the exam.
    for (const shift of [0, -1, 1, -2, 2]) {
      const day = addDays(target, shift);
      if (day < today || day >= examDay) continue;
      // The short last round is allowed on the rest day – the day before the exam matters most.
      if (opts.restDay !== null && day.getDay() === opts.restDay && kind !== "final") continue;
      const sameDay = placed.filter((p) => isSameDay(p.start, day));
      if (sameDay.some((p) => p.examKey === exam.key)) continue; // interleave: one session per module and day
      const otherExamThatDay = examDays.some((d) => isSameDay(d, day));
      if (sameDay.length >= (otherExamThatDay ? 1 : opts.maxPerDay)) continue;
      const start = findSlot(day, minutes, opts, [...timed, ...placed]);
      if (!start) continue;
      placed.push({
        examKey: exam.key,
        moduleId: exam.moduleId,
        kind,
        title: `${exam.name} · ${KIND_LABELS[kind]}`,
        description: blockDescription(kind, exam.examType),
        start,
        end: addMinutes(start, minutes),
        daysBefore: differenceInCalendarDays(examDay, day),
      });
      break;
    }
  }
  return placed.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Weekly rhythm: `perWeek` short reviews per module and week, preferably the
 * day after its lecture. Big modules choose first; every module gets its first
 * review of a week before any gets a second one.
 */
export function planWeekly(modules: PlanModule[], busy: BusyTime[], opts: WeeklyOptions): PlannedBlock[] {
  const today = startOfDay(opts.now);
  const timed = busy.filter((b) => !b.allDay);
  const placed: PlannedBlock[] = [];
  const ordered = [...modules].sort((a, b) => (b.ects ?? 0) - (a.ects ?? 0) || a.name.localeCompare(b.name));
  const minutes = minutesFor("weekly", opts.blockMinutes);

  for (let w = 0; w < opts.weeks; w++) {
    const weekStart = addDays(startOfWeek(today, { weekStartsOn: 1 }), 7 * w);
    const weekEnd = addDays(weekStart, 7);
    const inWeek = (d: Date) => d >= weekStart && d < weekEnd;
    for (let k = 0; k < opts.perWeek; k++) {
      ordered.forEach((mod, mi) => {
        const own = busy.filter((b) => b.studyModuleId === mod.moduleId && inWeek(b.start)).length;
        const done = placed.filter((p) => p.moduleId === mod.moduleId && inWeek(p.start)).length;
        if (own + done > k) return;
        const lectures = [...new Set(busy.filter((b) => b.lectureModuleId === mod.moduleId && inWeek(b.start)).map((b) => differenceInCalendarDays(startOfDay(b.start), weekStart)))].sort((a, b) => a - b);
        // The day after a lecture, otherwise spread the modules over the week.
        const preferred = lectures.length ? Math.min(6, lectures[k % lectures.length]! + 1 + 2 * Math.floor(k / lectures.length)) : (mi * 2 + k * 3) % 6;
        const examDay = mod.examDate ? startOfDay(mod.examDate) : null;
        for (const shift of [0, 1, -1, 2, -2, 3, -3]) {
          const index = preferred + shift;
          if (index < 0 || index > 6) continue;
          const day = addDays(weekStart, index);
          if (day < today || (examDay && day >= examDay)) continue;
          if (opts.restDay !== null && day.getDay() === opts.restDay) continue;
          const sameDay = placed.filter((p) => isSameDay(p.start, day));
          if (sameDay.some((p) => p.moduleId === mod.moduleId) || sameDay.length >= opts.maxPerDay) continue;
          const start = findSlot(day, minutes, opts, [...timed, ...placed]);
          if (!start) continue;
          placed.push({
            examKey: mod.key,
            moduleId: mod.moduleId,
            kind: "weekly",
            title: `${mod.name} · ${KIND_LABELS.weekly}`,
            description: blockDescription("weekly", null),
            start,
            end: addMinutes(start, minutes),
            daysBefore: null,
          });
          break;
        }
      });
    }
  }
  return placed.sort((a, b) => a.start.getTime() - b.start.getTime());
}
