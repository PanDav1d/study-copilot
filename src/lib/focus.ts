/**
 * Pomodoro focus timer: pure state transitions (the component in
 * components/focus only ticks, persists and notifies). Times are epoch ms.
 *
 * focus ──(time up / skip)──▶ break ──(time up / skip)──▶ idle
 * Every `every`-th focus block is followed by a long break.
 */

export interface FocusConfig {
  /** Minutes. */
  focus: number;
  brk: number;
  long: number;
  every: number;
}

export const FOCUS_PRESETS: { label: string; config: FocusConfig }[] = [
  { label: "25 / 5", config: { focus: 25, brk: 5, long: 15, every: 4 } },
  { label: "50 / 10", config: { focus: 50, brk: 10, long: 20, every: 3 } },
  { label: "90 / 15", config: { focus: 90, brk: 15, long: 30, every: 2 } },
];

/** Focus blocks shorter than this are not logged (and earn nothing). */
export const MIN_LOGGED_MINUTES = 5;

export type FocusPhase = "idle" | "focus" | "break";

export interface FocusState {
  phase: FocusPhase;
  /** While running: end of the phase. Null while paused or idle. */
  endsAt: number | null;
  /** While paused: ms left. */
  left: number | null;
  /** Length of the current phase in ms (for the progress ring). */
  total: number;
  /** Start of the current focus block. */
  startedAt: number | null;
  /** Focus time already done before the last pause, in ms. */
  banked: number;
  /** Start of the running focus segment (null while paused / in a break). */
  segmentStart: number | null;
  moduleId: string | null;
  config: FocusConfig;
  /** Focus blocks finished in this cycle. */
  round: number;
  /** Hide the navigation while focusing. */
  zen: boolean;
}

export const IDLE: FocusState = {
  phase: "idle",
  endsAt: null,
  left: null,
  total: 0,
  startedAt: null,
  banked: 0,
  segmentStart: null,
  moduleId: null,
  config: FOCUS_PRESETS[0]!.config,
  round: 0,
  zen: true,
};

const MIN = 60_000;

export const isRunning = (s: FocusState) => s.phase !== "idle" && s.endsAt !== null;
export const isPaused = (s: FocusState) => s.phase !== "idle" && s.endsAt === null;

export function remaining(s: FocusState, now: number) {
  if (s.phase === "idle") return 0;
  return s.endsAt !== null ? Math.max(0, s.endsAt - now) : (s.left ?? 0);
}

/** Share of the phase that is done (0–1). */
export function progress(s: FocusState, now: number) {
  return s.total > 0 ? Math.min(1, 1 - remaining(s, now) / s.total) : 0;
}

/** Focus minutes done in the current block (pauses excluded). */
export function focusedMinutes(s: FocusState, now: number) {
  if (s.phase !== "focus") return 0;
  const running = s.segmentStart !== null ? Math.min(now, s.endsAt ?? now) - s.segmentStart : 0;
  return Math.floor((s.banked + Math.max(0, running)) / MIN);
}

export function start(s: FocusState, now: number, opts: { config?: FocusConfig; moduleId?: string | null } = {}): FocusState {
  const config = opts.config ?? s.config;
  const total = config.focus * MIN;
  return {
    ...s,
    phase: "focus",
    config,
    moduleId: opts.moduleId !== undefined ? opts.moduleId : s.moduleId,
    total,
    endsAt: now + total,
    left: null,
    startedAt: now,
    banked: 0,
    segmentStart: now,
  };
}

export function pause(s: FocusState, now: number): FocusState {
  if (!isRunning(s)) return s;
  return {
    ...s,
    left: remaining(s, now),
    endsAt: null,
    banked: s.segmentStart !== null ? s.banked + (now - s.segmentStart) : s.banked,
    segmentStart: null,
  };
}

export function resume(s: FocusState, now: number): FocusState {
  if (!isPaused(s)) return s;
  return { ...s, endsAt: now + (s.left ?? 0), left: null, segmentStart: s.phase === "focus" ? now : null };
}

/** +n minutes for the current phase. */
export function extend(s: FocusState, minutes: number): FocusState {
  if (s.phase === "idle") return s;
  const ms = minutes * MIN;
  return { ...s, total: s.total + ms, endsAt: s.endsAt !== null ? s.endsAt + ms : null, left: s.left !== null ? s.left + ms : null };
}

/**
 * The focus block is over (time up or skipped): returns what to log and the
 * break that follows (long break every `every` blocks).
 */
export function finishFocus(s: FocusState, now: number): { state: FocusState; log: { minutes: number; startedAt: number; moduleId: string | null } | null } {
  if (s.phase !== "focus") return { state: s, log: null };
  const minutes = focusedMinutes(s, now);
  const round = s.round + 1;
  const long = round % s.config.every === 0;
  const total = (long ? s.config.long : s.config.brk) * MIN;
  return {
    state: { ...s, phase: "break", round, total, endsAt: now + total, left: null, startedAt: null, banked: 0, segmentStart: null },
    log: minutes >= MIN_LOGGED_MINUTES && s.startedAt !== null ? { minutes, startedAt: s.startedAt, moduleId: s.moduleId } : null,
  };
}

export function finishBreak(s: FocusState): FocusState {
  return { ...s, phase: "idle", endsAt: null, left: null, total: 0 };
}

/** Stop everything (a running focus block is logged by the caller via `finishFocus` first). */
export function stop(s: FocusState): FocusState {
  return { ...IDLE, moduleId: s.moduleId, config: s.config, zen: s.zen };
}

export function isLongBreak(s: FocusState) {
  return s.phase === "break" && s.round > 0 && s.round % s.config.every === 0;
}

export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Defensive parse of the persisted state. */
export function parseFocus(raw: string | null): FocusState {
  if (!raw) return IDLE;
  try {
    const v = JSON.parse(raw) as Partial<FocusState> | null;
    if (!v || !["idle", "focus", "break"].includes(v.phase as string)) return IDLE;
    const num = (x: unknown, d: number | null) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    const c = v.config;
    const config: FocusConfig =
      c && [c.focus, c.brk, c.long, c.every].every((n) => Number.isInteger(n) && n >= 1 && n <= 240)
        ? { focus: c.focus, brk: c.brk, long: c.long, every: c.every }
        : IDLE.config;
    return {
      phase: v.phase!,
      endsAt: num(v.endsAt, null),
      left: num(v.left, null),
      total: num(v.total, 0)!,
      startedAt: num(v.startedAt, null),
      banked: num(v.banked, 0)!,
      segmentStart: num(v.segmentStart, null),
      moduleId: typeof v.moduleId === "string" ? v.moduleId : null,
      config,
      round: Number.isInteger(v.round) && v.round! >= 0 ? v.round! : 0,
      zen: v.zen !== false,
    };
  } catch {
    return IDLE;
  }
}
