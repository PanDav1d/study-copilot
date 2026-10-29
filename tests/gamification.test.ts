import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  computeStreak,
  correctRun,
  levelInfo,
  newlyUnlocked,
  nextStep,
  sessionSteps,
  XP,
  xpForLevel,
  type AchievementStats,
} from "@/lib/gamification";

describe("levels", () => {
  it("uses a growing XP curve", () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
  });

  it("computes level and progress within the level", () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, current: 0, needed: 100, title: "Erstsemester" });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toMatchObject({ level: 2, current: 0, needed: 200 });
    expect(levelInfo(450)).toMatchObject({ level: 3, current: 150, needed: 300, progress: 0.5, title: "Kommilitone" });
  });

  it("never rewards failure less than zero – a failed review still earns XP", () => {
    expect(XP.review[1]).toBeGreaterThan(0);
    expect(XP.review[3]).toBeGreaterThanOrEqual(XP.review[1]!);
  });
});

describe("streak", () => {
  const now = new Date("2026-10-19T15:00:00");
  const day = (offset: number, hour = 10) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hour);
    return d;
  };

  it("counts consecutive days including today", () => {
    expect(computeStreak([day(0), day(-1), day(-2), day(-4)], now)).toEqual({ streak: 3, activeToday: true });
  });

  it("keeps yesterday's streak alive while today has no activity yet", () => {
    expect(computeStreak([day(-1), day(-2)], now)).toEqual({ streak: 2, activeToday: false });
  });

  it("is broken after a missed day", () => {
    expect(computeStreak([day(-2), day(-3)], now).streak).toBe(0);
    expect(computeStreak([], now).streak).toBe(0);
  });

  it("counts several activities on one day once", () => {
    expect(computeStreak([day(0, 8), day(0, 9), day(0, 23)], now).streak).toBe(1);
  });
});

describe("Cornell 5R steps", () => {
  const rows = [
    { cue: "Was ist X?", content: "X ist …" },
    { cue: "", content: "Detail" },
    { cue: "", content: "" },
  ];

  it("tracks each step", () => {
    const steps = sessionSteps({ rows, summary: "", recallAt: null, cardCount: 0 });
    expect(steps).toEqual({ record: true, reduce: true, recite: false, reflect: false, review: false });
    expect(nextStep(steps)).toBe("recite");
  });

  it("requires questions for at least half of the noted rows", () => {
    const many = [...rows, { cue: "", content: "a" }, { cue: "", content: "b" }];
    expect(sessionSteps({ rows: many, summary: "", recallAt: null, cardCount: 0 }).reduce).toBe(false);
  });

  it("requires a real summary, not a placeholder", () => {
    expect(sessionSteps({ rows, summary: "ok", recallAt: null, cardCount: 0 }).reflect).toBe(false);
    expect(sessionSteps({ rows, summary: "Die Normalisierung vermeidet Anomalien durch Zerlegung.", recallAt: null, cardCount: 0 }).reflect).toBe(true);
  });

  it("is complete when all five steps are done", () => {
    const steps = sessionSteps({ rows, summary: "x".repeat(50), recallAt: new Date(), cardCount: 2 });
    expect(nextStep(steps)).toBeNull();
  });
});

describe("achievements", () => {
  const base: AchievementStats = {
    sessions: 0, summaries: 0, freshSummaries: 0, recalls: 0, reviews: 0, mastered: 0,
    streak: 0, level: 1, correctInARow: 0, reviewHour: null, examReadyModules: 0, exams: 0, bestExamPercent: 0,
  };

  it("unlocks only what was earned and not yet unlocked", () => {
    const unlocked = newlyUnlocked({ ...base, sessions: 1, summaries: 1 }, new Set(["first_session"]));
    expect(unlocked.map((a) => a.key)).toEqual(["first_summary"]);
  });

  it("detects time-of-day achievements from the review hour", () => {
    expect(newlyUnlocked({ ...base, reviewHour: 6 }, new Set()).map((a) => a.key)).toContain("early_bird");
    expect(newlyUnlocked({ ...base, reviewHour: 23 }, new Set()).map((a) => a.key)).toContain("night_owl");
    expect(newlyUnlocked({ ...base, reviewHour: 14 }, new Set())).toEqual([]);
  });

  it("has unique keys", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
  });

  it("measures the current run of correct answers", () => {
    expect(correctRun([3, 4, 2, 1, 3])).toBe(3);
    expect(correctRun([1, 3])).toBe(0);
  });
});
