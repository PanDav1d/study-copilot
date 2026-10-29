import { describe, expect, it } from "vitest";
import { eventSchema, flashcardSchema, moduleSchema, semesterSchema, settingsSchema } from "@/lib/validation";

describe("validation schemas", () => {
  it("parses local dates and rejects end before start", () => {
    const ok = semesterSchema.parse({ name: "WS 26/27", number: "3", startDate: "2026-10-01", endDate: "2027-03-31" });
    expect(ok.number).toBe(3);
    expect(ok.startDate?.getMonth()).toBe(9);
    expect(semesterSchema.safeParse({ name: "X", startDate: "2027-01-01", endDate: "2026-01-01" }).success).toBe(false);
  });

  it("normalizes empty optional fields to null", () => {
    const m = moduleSchema.parse({ semesterId: "abc", name: "Datenbanken", code: "", examDate: "", examType: "", ects: "" });
    expect(m).toMatchObject({ code: null, examDate: null, examType: null, ects: null, color: "indigo" });
  });

  it("rejects invalid ids (no injection through ids)", () => {
    expect(flashcardSchema.safeParse({ moduleId: "abc'; DROP", front: "a", back: "b" }).success).toBe(false);
  });

  it("requires front and back of a flashcard", () => {
    expect(flashcardSchema.safeParse({ moduleId: "abc", front: "  ", back: "b" }).success).toBe(false);
  });

  it("validates calendar events", () => {
    const base = { type: "LECTURE", title: "VL", start: "2026-10-20T09:00", end: "2026-10-20T12:15" };
    expect(eventSchema.parse(base)).toMatchObject({ repeatWeeks: 0, moduleId: null });
    expect(eventSchema.safeParse({ ...base, end: "2026-10-20T08:00" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, type: "PARTY" }).success).toBe(false);
  });

  it("bounds FSRS settings", () => {
    expect(settingsSchema.safeParse({ name: "A", requestRetention: 0.5, maximumInterval: 365, enableFuzz: true, dailyNewLimit: 20 }).success).toBe(false);
    expect(settingsSchema.safeParse({ name: "A", requestRetention: 0.9, maximumInterval: 365, enableFuzz: true, dailyNewLimit: 20, dailyXpGoal: 50 }).success).toBe(true);
  });
});
