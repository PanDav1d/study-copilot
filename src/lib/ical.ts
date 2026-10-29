/**
 * Minimal iCalendar (RFC 5545) reader for bulk-importing lecture plans,
 * e.g. the iCal export of Rapla (DHBW), Moodle, Outlook or Google Calendar.
 *
 * Supports: line folding, escaped text, UTC / TZID / floating times, all-day
 * events, RRULE (DAILY/WEEKLY/MONTHLY with INTERVAL, COUNT, UNTIL, BYDAY),
 * EXDATE, moved occurrences (RECURRENCE-ID) and cancelled events.
 * Pure – runs in the browser and on the server.
 */

export interface IcalEvent {
  /** Stable per occurrence: UID + original start. Re-imports update instead of duplicating. */
  externalId: string;
  title: string;
  description: string;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface RawEvent {
  props: Prop[];
}

const MAX_OCCURRENCES = 500;
const MAX_SPAN_MS = 3 * 365 * 86_400_000;

function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
}

function parseProp(line: string): Prop | null {
  // NAME;PARAM=value;PARAM="quoted:value":VALUE – the first colon outside quotes ends the params.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name!.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(v: string) {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c)).trim();
}

/** Offset of `timeZone` from UTC at the given instant, in ms. */
function tzOffset(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

function zonedTime(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date | null {
  try {
    const guess = Date.UTC(y, mo, d, h, mi, s);
    let ts = guess - tzOffset(guess, timeZone);
    // Second pass corrects guesses that land on the other side of a DST switch.
    ts = guess - tzOffset(ts, timeZone);
    return new Date(ts);
  } catch {
    return null; // unknown time zone
  }
}

interface ParsedTime {
  date: Date;
  allDay: boolean;
}

function parseTime(value: string, params: Record<string, string>): ParsedTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const Y = Number(y), M = Number(mo) - 1, D = Number(d);
  if (h === undefined || params.VALUE === "DATE") return { date: new Date(Y, M, D), allDay: true };
  const H = Number(h), MI = Number(mi), S = Number(s ?? 0);
  if (z) return { date: new Date(Date.UTC(Y, M, D, H, MI, S)), allDay: false };
  const tz = params.TZID;
  // Floating times (and unknown zones) are taken as local time.
  return { date: (tz && zonedTime(Y, M, D, H, MI, S, tz)) || new Date(Y, M, D, H, MI, S), allDay: false };
}

function parseDuration(v: string) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((Number(w ?? 0) * 7 + Number(d ?? 0)) * 86_400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

interface Rule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  count?: number;
  until?: Date;
  byDay?: number[];
}

function parseRule(value: string, params: Record<string, string>): Rule | null {
  const parts = Object.fromEntries(value.split(";").map((p) => p.split("=") as [string, string]).map(([k, v]) => [k?.toUpperCase(), v]));
  const freq = parts.FREQ?.toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  const rule: Rule = { freq, interval: Math.max(1, Number(parts.INTERVAL) || 1) };
  if (parts.COUNT) rule.count = Math.min(MAX_OCCURRENCES, Number(parts.COUNT) || 1);
  if (parts.UNTIL) {
    const u = parseTime(parts.UNTIL, params);
    // An all-day UNTIL includes that whole day.
    if (u) rule.until = u.allDay ? new Date(u.date.getFullYear(), u.date.getMonth(), u.date.getDate(), 23, 59, 59) : u.date;
  }
  if (parts.BYDAY && freq === "WEEKLY") {
    const days = parts.BYDAY.split(",").map((d) => WEEKDAYS.indexOf(d.replace(/^[+-]?\d+/, "").toUpperCase())).filter((d) => d >= 0);
    if (days.length) rule.byDay = days;
  }
  return rule;
}

function addDaysKeepTime(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Occurrence starts of a recurring event, in local wall-clock time (DST-safe). */
function expand(start: Date, rule: Rule): Date[] {
  const out: Date[] = [];
  const limit = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const hardEnd = new Date(start.getTime() + MAX_SPAN_MS);
  const end = rule.until && rule.until < hardEnd ? rule.until : hardEnd;
  const push = (d: Date) => {
    if (d < start || d > end || out.length >= limit) return false;
    out.push(d);
    return true;
  };

  if (rule.freq === "WEEKLY") {
    const days = rule.byDay ?? [start.getDay()];
    // Start of the week (Monday) containing the first occurrence.
    const weekStart = addDaysKeepTime(start, -((start.getDay() + 6) % 7));
    for (let w = 0; out.length < limit; w += rule.interval) {
      const base = addDaysKeepTime(weekStart, w * 7);
      if (base > end) break;
      const inWeek = days
        .map((wd) => addDaysKeepTime(base, (wd + 6) % 7))
        .sort((a, b) => a.getTime() - b.getTime());
      for (const d of inWeek) push(d);
    }
  } else {
    for (let i = 0; out.length < limit; i += rule.interval) {
      const d = new Date(start);
      if (rule.freq === "DAILY") d.setDate(d.getDate() + i);
      else {
        d.setMonth(d.getMonth() + i);
        if (d.getDate() !== start.getDate()) continue; // e.g. the 31st in a short month
      }
      if (d > end) break;
      push(d);
    }
  }
  return out;
}

function prop(e: RawEvent, name: string) {
  return e.props.find((p) => p.name === name);
}

function hashString(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readEvents(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  let nested = 0; // VALARM etc. inside an event
  for (const line of unfold(text).split("\n")) {
    if (!line.trim()) continue;
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = { props: [] };
      nested = 0;
    } else if (upper === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      if (upper.startsWith("BEGIN:")) nested++;
      else if (upper.startsWith("END:")) nested = Math.max(0, nested - 1);
      else if (nested === 0) {
        const p = parseProp(line);
        if (p) current.props.push(p);
      }
    }
  }
  return events;
}

export function isIcal(text: string) {
  return /BEGIN:VCALENDAR/i.test(text.slice(0, 2000));
}

/** Parses an .ics file into single occurrences, sorted by start. */
export function parseIcal(text: string): IcalEvent[] {
  const raw = readEvents(text);
  const out: IcalEvent[] = [];
  // Moved/changed single occurrences: UID → original start (ms) → replacement.
  const overrides = new Map<string, Set<number>>();

  const build = (e: RawEvent, start: ParsedTime, duration: number, idTime: Date): IcalEvent => {
    const uid = prop(e, "UID")?.value.trim() || hashString(`${prop(e, "SUMMARY")?.value}|${start.date.toISOString()}`);
    const endDate = new Date(start.date.getTime() + duration);
    return {
      externalId: `${uid}@${idTime.toISOString()}`.slice(0, 300),
      title: unescapeText(prop(e, "SUMMARY")?.value ?? "") || "Termin",
      description: unescapeText(prop(e, "DESCRIPTION")?.value ?? "").slice(0, 5000),
      location: unescapeText(prop(e, "LOCATION")?.value ?? "") || null,
      start: start.date,
      // All-day DTEND is exclusive – the event ends on the previous day.
      end: start.allDay ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - (duration > 0 ? 1 : 0), 23, 59) : endDate,
      allDay: start.allDay,
    };
  };

  const timing = (e: RawEvent) => {
    const dtstart = prop(e, "DTSTART");
    const start = dtstart && parseTime(dtstart.value, dtstart.params);
    if (!start) return null;
    const dtend = prop(e, "DTEND");
    const end = dtend && parseTime(dtend.value, dtend.params);
    const dur = prop(e, "DURATION");
    const duration = end ? end.date.getTime() - start.date.getTime() : dur ? parseDuration(dur.value) ?? 0 : start.allDay ? 86_400_000 : 0;
    return { start, duration: Math.max(0, duration) };
  };

  const cancelled = (e: RawEvent) => prop(e, "STATUS")?.value.trim().toUpperCase() === "CANCELLED";

  for (const e of raw) {
    const rid = prop(e, "RECURRENCE-ID");
    if (!rid) continue;
    const uid = prop(e, "UID")?.value.trim() ?? "";
    const original = parseTime(rid.value, rid.params);
    const t = timing(e);
    if (!original || !t) continue;
    (overrides.get(uid) ?? overrides.set(uid, new Set()).get(uid)!).add(original.date.getTime());
    if (!cancelled(e)) out.push(build(e, t.start, t.duration, original.date));
  }

  for (const e of raw) {
    if (prop(e, "RECURRENCE-ID") || cancelled(e)) continue;
    const t = timing(e);
    if (!t) continue;
    const rrule = prop(e, "RRULE");
    const rule = rrule && parseRule(rrule.value, prop(e, "DTSTART")!.params);
    if (!rule) {
      out.push(build(e, t.start, t.duration, t.start.date));
      continue;
    }
    const uid = prop(e, "UID")?.value.trim() ?? "";
    const skip = new Set(overrides.get(uid));
    for (const ex of e.props.filter((p) => p.name === "EXDATE")) {
      for (const v of ex.value.split(",")) {
        const d = parseTime(v, { ...prop(e, "DTSTART")!.params, ...ex.params });
        if (d) skip.add(d.date.getTime());
      }
    }
    const skipDays = new Set([...skip].map((ms) => new Date(ms).toDateString()));
    for (const occ of expand(t.start.date, rule)) {
      if (skip.has(occ.getTime()) || (t.start.allDay && skipDays.has(occ.toDateString()))) continue;
      out.push(build(e, { date: occ, allDay: t.start.allDay }, t.duration, occ));
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Lowercase, without accents and punctuation – for fuzzy title matching. */
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
}

/**
 * Best module for an imported event title: the module whose code or name
 * appears in the title (longest match wins), e.g. "T3INF2004 Datenbanken – Vorlesung".
 */
export function matchModule<M extends { id: string; name: string; code: string | null }>(title: string, modules: M[]): M | null {
  const t = ` ${normalize(title)} `;
  let best: { m: M; score: number } | null = null;
  for (const m of modules) {
    for (const key of [m.code, m.name]) {
      if (!key) continue;
      const k = normalize(key);
      if (k.length < 2) continue;
      // Whole words, a long key inside a word (e.g. a code with suffix), or a short title naming the module.
      const hit = t.includes(` ${k} `) || (k.length >= 5 && t.includes(k)) || (t.trim().length >= 5 && ` ${k} `.includes(t));
      if (hit && (!best || k.length > best.score)) best = { m, score: k.length };
    }
  }
  return best?.m ?? null;
}

/** Event type suggested from the title. */
export function guessEventType(title: string): "LECTURE" | "DEADLINE" | "OTHER" {
  if (/abgabe|deadline|frist/i.test(title)) return "DEADLINE";
  if (/klausur|prüfung|pruefung|exam/i.test(title)) return "OTHER";
  return "LECTURE";
}
