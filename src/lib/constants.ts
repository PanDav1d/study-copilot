export const EXAM_TYPES = {
  KLAUSUR: "Klausur",
  MUENDLICH: "Mündliche Prüfung",
  HAUSARBEIT: "Hausarbeit",
  PROJEKT: "Projektarbeit",
  PRAESENTATION: "Präsentation / Referat",
  PORTFOLIO: "Portfolio",
  LABOR: "Laborarbeit",
  SONSTIGE: "Sonstige",
} as const;
export type ExamType = keyof typeof EXAM_TYPES;
export const EXAM_TYPE_KEYS = Object.keys(EXAM_TYPES) as [ExamType, ...ExamType[]];

export const EVENT_TYPES = {
  LECTURE: "Vorlesung",
  STUDY: "Lerneinheit",
  DEADLINE: "Abgabe / Frist",
  OTHER: "Sonstiges",
} as const;
export type EventType = keyof typeof EVENT_TYPES;
export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES) as [EventType, ...EventType[]];

export const MODULE_COLORS = {
  indigo: { label: "Indigo", dot: "bg-indigo-500", soft: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", border: "border-indigo-500" },
  sky: { label: "Himmelblau", dot: "bg-sky-500", soft: "bg-sky-500/10 text-sky-700 dark:text-sky-300", border: "border-sky-500" },
  teal: { label: "Petrol", dot: "bg-teal-500", soft: "bg-teal-500/10 text-teal-700 dark:text-teal-300", border: "border-teal-500" },
  emerald: { label: "Grün", dot: "bg-emerald-500", soft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", border: "border-emerald-500" },
  amber: { label: "Bernstein", dot: "bg-amber-500", soft: "bg-amber-500/10 text-amber-800 dark:text-amber-300", border: "border-amber-500" },
  orange: { label: "Orange", dot: "bg-orange-500", soft: "bg-orange-500/10 text-orange-700 dark:text-orange-300", border: "border-orange-500" },
  rose: { label: "Rosé", dot: "bg-rose-500", soft: "bg-rose-500/10 text-rose-700 dark:text-rose-300", border: "border-rose-500" },
  fuchsia: { label: "Fuchsia", dot: "bg-fuchsia-500", soft: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300", border: "border-fuchsia-500" },
  violet: { label: "Violett", dot: "bg-violet-500", soft: "bg-violet-500/10 text-violet-700 dark:text-violet-300", border: "border-violet-500" },
  slate: { label: "Grau", dot: "bg-slate-500", soft: "bg-slate-500/10 text-slate-700 dark:text-slate-300", border: "border-slate-500" },
} as const;
export type ModuleColor = keyof typeof MODULE_COLORS;
export const MODULE_COLOR_KEYS = Object.keys(MODULE_COLORS) as [ModuleColor, ...ModuleColor[]];

export function moduleColor(color: string | null | undefined) {
  return MODULE_COLORS[(color ?? "indigo") as ModuleColor] ?? MODULE_COLORS.indigo;
}

/** Cookie holding the desktop sidebar state ("collapsed" | "open"). */
export const SIDEBAR_COOKIE = "sidebar";

/** Request header set by the proxy for `?embed=1` (page shown in the split pane). */
export const EMBED_HEADER = "x-study-embed";
