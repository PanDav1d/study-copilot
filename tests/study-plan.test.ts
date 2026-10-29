import { describe, expect, it } from "vitest";
import { addDays, isSameDay } from "date-fns";
import { warmupRows } from "@/lib/cornell";
import { DEFAULT_PLAN_OPTIONS, kindFor, offsetsFor, planStudy, planWeekly, type PlanExam, type PlanModule } from "@/lib/study-plan";

// Monday morning, three exams in the following weeks.
const now = new Date("2026-03-02T08:00:00");
const at = (days: number, hour = 9) => {
  const d = addDays(new Date("2026-03-02T00:00:00"), days);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const exam = (key: string, days: number, ects: number | null = 5): PlanExam => ({ key, moduleId: key, name: key, examDate: at(days), examType: "KLAUSUR", ects });
const opts = { ...DEFAULT_PLAN_OPTIONS, now };

describe("exam-phase planner", () => {
  it("spreads sessions before the exam, with mock exam and a short last round", () => {
    const blocks = planStudy([exam("db", 24)], [], opts);
    expect(blocks.length).toBeGreaterThanOrEqual(8);
    expect(blocks.every((b) => b.start >= now && b.end < at(24))).toBe(true);
    expect(blocks.some((b) => b.kind === "mock")).toBe(true);
    const last = blocks.at(-1)!;
    expect(last.kind).toBe("final");
    expect(last.end.getTime() - last.start.getTime()).toBeLessThanOrEqual(45 * 60_000);
  });

  it("interleaves: never two sessions of one module on the same day, respects the daily maximum and rest day", () => {
    const blocks = planStudy([exam("a", 20), exam("b", 21), exam("c", 22), exam("d", 23)], [], { ...opts, maxPerDay: 2 });
    const days = new Map<string, string[]>();
    for (const b of blocks) {
      const k = b.start.toDateString();
      days.set(k, [...(days.get(k) ?? []), b.examKey]);
    }
    for (const keys of days.values()) {
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.length).toBeLessThanOrEqual(2);
    }
    expect(blocks.some((b) => b.start.getDay() === 0 && b.kind !== "final")).toBe(false);
  });

  it("plans around lectures and skips days already covered by own study sessions", () => {
    const lecture = { start: at(3, 9), end: at(3, 17) };
    const own = { start: at(11, 14), end: at(11, 15), studyModuleId: "db" }; // day of the 13-days-before session
    const blocks = planStudy([exam("db", 24)], [lecture, own], opts);
    const onLectureDay = blocks.filter((b) => isSameDay(b.start, at(3)));
    expect(onLectureDay.every((b) => b.start >= at(3, 17))).toBe(true);
    expect(blocks.some((b) => isSameDay(b.start, at(11)))).toBe(false);
  });

  it("plans fewer sessions for small modules and nothing in the past", () => {
    expect(planStudy([exam("s", 24, 3)], [], opts).length).toBeLessThan(planStudy([exam("l", 24, 6)], [], opts).length);
    const soon = planStudy([exam("x", 2)], [], opts);
    expect(soon.every((b) => b.start >= now)).toBe(true);
    expect(soon.map((b) => b.kind)).toContain("final");
  });

  it("keeps the last round when the day before the exam is the rest day", () => {
    // Exam on Monday, 30 March → the day before is a Sunday.
    const blocks = planStudy([exam("db", 28)], [], opts);
    expect(at(27).getDay()).toBe(0);
    expect(blocks.at(-1)).toMatchObject({ kind: "final", daysBefore: 1 });
  });

  it("starts as early as asked: earlier starts add refresher rounds with growing gaps", () => {
    const three = planStudy([exam("db", 60)], [], opts);
    const eight = planStudy([exam("db", 60)], [], { ...opts, leadDays: 56 });
    const asap = planStudy([exam("db", 60)], [], { ...opts, leadDays: null });
    expect(three[0]!.daysBefore).toBeLessThanOrEqual(21);
    expect(eight[0]!.daysBefore).toBeGreaterThanOrEqual(54);
    expect(asap[0]!.daysBefore).toBeGreaterThanOrEqual(57);
    expect(eight.length).toBeGreaterThan(three.length);
    // The first session is always the overview, the far-away ones are short refreshers.
    expect(eight[0]!.kind).toBe("overview");
    expect(eight.filter((b) => b.kind === "spaced").length).toBeGreaterThan(0);
    expect(eight.filter((b) => b.kind === "spaced").every((b) => b.end.getTime() - b.start.getTime() <= 60 * 60_000)).toBe(true);
    const gaps = offsetsFor({ ects: 5 }, 95);
    expect(gaps[0]).toBe(95);
    expect(gaps[0]! - gaps[1]!).toBeGreaterThan(gaps.at(-2)! - gaps.at(-1)!);
  });

  it("opens a short preparation with an overview too", () => {
    const blocks = planStudy([exam("db", 9)], [], opts);
    expect(blocks[0]!.kind).toBe("overview");
    expect(blocks.at(-1)!.kind).toBe("final");
  });

  it("maps distance to block kind", () => {
    expect(kindFor(30)).toBe("spaced");
    expect(kindFor(21)).toBe("overview");
    expect(kindFor(7)).toBe("retrieval");
    expect(kindFor(3)).toBe("mock");
    expect(kindFor(1)).toBe("final");
  });
});

describe("weekly rhythm", () => {
  const mod = (key: string, ects: number | null = 5, examIn: number | null = null): PlanModule => ({ key, moduleId: key, name: key, ects, examDate: examIn === null ? null : at(examIn) });
  const weekly = { ...opts, weeks: 3, perWeek: 1 };

  it("plans one review per module and week, never two modules more than allowed on a day", () => {
    const blocks = planWeekly([mod("a"), mod("b"), mod("c")], [], weekly);
    for (const k of ["a", "b", "c"]) expect(blocks.filter((b) => b.moduleId === k)).toHaveLength(3);
    expect(blocks.every((b) => b.kind === "weekly" && b.daysBefore === null && b.start >= now)).toBe(true);
    expect(blocks.some((b) => b.start.getDay() === 0)).toBe(false);
  });

  it("puts the review on the day after the lecture and counts own study sessions", () => {
    const lecture = { start: at(1, 9), end: at(1, 12), lectureModuleId: "db" }; // Tuesday
    const blocks = planWeekly([mod("db")], [lecture, { start: at(8, 10), end: at(8, 11), studyModuleId: "db" }], weekly);
    expect(isSameDay(blocks[0]!.start, at(2))).toBe(true);
    expect(blocks.some((b) => b.start >= at(7) && b.start < at(14))).toBe(false);
  });

  it("stops at the exam", () => {
    const blocks = planWeekly([mod("db", 5, 9)], [], weekly);
    expect(blocks.every((b) => b.start < at(9))).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });
});

describe("warm-up rows", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, cue: `Q${i}`, content: `A${i}` }));
  it("spreads the picks over the whole sheet and skips rows without answer", () => {
    const picked = warmupRows(rows, 4).map((r) => r.id);
    expect(picked).toEqual(["r1", "r4", "r7", "r10"]);
    expect(warmupRows([{ id: "x", cue: "Q", content: " " }, ...rows.slice(0, 2)])).toHaveLength(2);
  });
});
