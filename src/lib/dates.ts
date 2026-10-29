import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isValid,
  parse,
} from "date-fns";
import { de } from "date-fns/locale";

export const locale = de;

export function fmtDate(d: Date | null | undefined, pattern = "dd.MM.yyyy") {
  return d ? format(d, pattern, { locale: de }) : "–";
}

export function fmtDateTime(d: Date | null | undefined) {
  return d ? format(d, "dd.MM.yyyy, HH:mm", { locale: de }) : "–";
}

export function fmtTime(d: Date) {
  return format(d, "HH:mm", { locale: de });
}

export function fmtRelative(d: Date) {
  return formatDistanceToNowStrict(d, { locale: de, addSuffix: true });
}

/** "heute", "morgen", "in 5 Tagen", "vor 2 Tagen" */
export function fmtDaysUntil(d: Date, now = new Date()) {
  const days = differenceInCalendarDays(d, now);
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  if (days === -1) return "gestern";
  if (days > 0) return `in ${days} Tagen`;
  return `vor ${-days} Tagen`;
}

/** Human readable interval for FSRS previews: 10 Min, 3 Std, 4 T, 2 Mon, 1,2 J */
export function fmtInterval(from: Date, to: Date) {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)} Min`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} Std`;
  const days = hours / 24;
  if (days < 31) return `${Math.round(days)} T`;
  const months = days / 30.44;
  if (months < 12) return `${months.toFixed(months < 10 ? 1 : 0).replace(".", ",")} Mon`;
  return `${(days / 365.25).toFixed(1).replace(".", ",")} J`;
}

/** Value for <input type="date"> */
export function toDateInput(d: Date | null | undefined) {
  return d ? format(d, "yyyy-MM-dd") : "";
}

/** Value for <input type="datetime-local"> */
export function toDateTimeInput(d: Date | null | undefined) {
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
}

/** Parses "yyyy-MM-dd" or "yyyy-MM-ddTHH:mm" in local time. */
export function parseLocalDate(value: string): Date | null {
  const pattern = value.includes("T") ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd";
  const d = parse(value, pattern, new Date());
  return isValid(d) ? d : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * German date typed by hand → "yyyy-MM-dd". Accepts "21.10.2026", "21.10.26",
 * "21.10." / "21.10" (current year), "211026", "21102026", "heute", "morgen",
 * "gestern" and ISO "2026-10-21".
 */
export function parseGermanDate(text: string, now = new Date()): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const rel = { gestern: -1, heute: 0, morgen: 1, "übermorgen": 2 }[t];
  if (rel !== undefined) return format(new Date(now.getFullYear(), now.getMonth(), now.getDate() + rel), "yyyy-MM-dd");
  let d: number, m: number, y: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const de = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4})?)?$/.exec(t);
  const digits = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (de || digits) {
    const g = (de ?? digits)!;
    d = Number(g[1]);
    m = Number(g[2]);
    y = g[3] ? Number(g[3]) : now.getFullYear();
    if (g[3]?.length === 2) y += 2000;
  } else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Time typed by hand → "HH:mm". Accepts "9", "9:30", "09.30", "930", "1430", "14 Uhr". */
export function parseGermanTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s*uhr$/, "");
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}
