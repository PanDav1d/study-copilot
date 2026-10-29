import { describe, expect, it } from "vitest";
import { IDLE, extend, finishBreak, finishFocus, focusedMinutes, formatClock, isLongBreak, parseFocus, pause, progress, remaining, resume, start, stop } from "@/lib/focus";

const MIN = 60_000;
const cfg = { focus: 25, brk: 5, long: 15, every: 2 };

describe("focus timer", () => {
  it("runs, pauses and resumes without counting the pause", () => {
    let s = start(IDLE, 0, { config: cfg, moduleId: "m1" });
    expect(s).toMatchObject({ phase: "focus", endsAt: 25 * MIN, moduleId: "m1" });
    expect(remaining(s, 10 * MIN)).toBe(15 * MIN);
    expect(progress(s, 10 * MIN)).toBeCloseTo(0.4);
    s = pause(s, 10 * MIN);
    expect(remaining(s, 99 * MIN)).toBe(15 * MIN); // frozen
    s = resume(s, 20 * MIN);
    expect(s.endsAt).toBe(35 * MIN);
    expect(focusedMinutes(s, 25 * MIN)).toBe(15); // 10 before + 5 after the pause
  });

  it("logs a finished block and alternates short / long breaks", () => {
    let s = start(IDLE, 0, { config: cfg, moduleId: null });
    const first = finishFocus(s, 25 * MIN);
    expect(first.log).toEqual({ minutes: 25, startedAt: 0, moduleId: null });
    expect(first.state).toMatchObject({ phase: "break", round: 1, total: 5 * MIN });
    expect(isLongBreak(first.state)).toBe(false);
    s = start(finishBreak(first.state), 30 * MIN);
    const second = finishFocus(s, 55 * MIN);
    expect(second.state.total).toBe(15 * MIN);
    expect(isLongBreak(second.state)).toBe(true);
  });

  it("does not log blocks under five minutes, extends and stops", () => {
    const s = start(IDLE, 0, { config: cfg });
    expect(finishFocus(s, 4 * MIN).log).toBeNull();
    expect(extend(s, 5).endsAt).toBe(30 * MIN);
    expect(stop({ ...s, zen: false })).toMatchObject({ phase: "idle", round: 0, zen: false, config: cfg });
  });

  it("formats the clock", () => {
    expect(formatClock(25 * MIN)).toBe("25:00");
    expect(formatClock(61_000)).toBe("1:01");
    expect(formatClock(90 * MIN)).toBe("1:30:00");
    expect(formatClock(500)).toBe("0:01");
  });

  it("parses persisted state defensively", () => {
    expect(parseFocus(null)).toBe(IDLE);
    expect(parseFocus("nope")).toBe(IDLE);
    expect(parseFocus(JSON.stringify({ phase: "weird" }))).toBe(IDLE);
    const s = start(IDLE, 1000, { config: cfg, moduleId: "m" });
    expect(parseFocus(JSON.stringify(s))).toEqual(s);
    expect(parseFocus(JSON.stringify({ ...s, config: { focus: 0 } })).config).toEqual(IDLE.config);
  });
});
