import { describe, expect, it } from "vitest";
import {
  buildReviewQueue,
  dueForecast,
  examUrgency,
  isDue,
  masteryLevel,
  newCardState,
  previewIntervals,
  Rating,
  retrievability,
  review,
  rollback,
  State,
  summarizeMastery,
  type QueueCandidate,
  type StoredCardState,
} from "@/lib/srs/scheduler";

const DAY = 86_400_000;
const settings = { requestRetention: 0.9, maximumInterval: 365, enableFuzz: false };
const t0 = new Date("2026-03-02T10:00:00");

/** Simulate a sequence of reviews, each done exactly when the card is due. */
function simulate(grades: Rating[], start = t0) {
  let card: StoredCardState = newCardState(start);
  let now = start;
  for (const g of grades) {
    card = review(card, g as 1 | 2 | 3 | 4, now, settings).card;
    now = card.due;
  }
  return { card, now };
}

describe("FSRS review", () => {
  it("a new card enters the learning phase and gets short intervals", () => {
    const { card } = simulate([Rating.Good]);
    expect(card.state).toBe(State.Learning);
    expect(card.reps).toBe(1);
    expect(card.due.getTime() - t0.getTime()).toBeLessThan(DAY);
  });

  it("Easy graduates a new card directly to review with a multi-day interval", () => {
    const { card } = simulate([Rating.Easy]);
    expect(card.state).toBe(State.Review);
    expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("intervals grow with consecutive successful reviews", () => {
    const intervals: number[] = [];
    let card = newCardState(t0);
    let now = t0;
    for (let i = 0; i < 6; i++) {
      card = review(card, Rating.Good, now, settings).card;
      intervals.push(card.due.getTime() - now.getTime());
      now = card.due;
    }
    const reviewIntervals = intervals.slice(2);
    for (let i = 1; i < reviewIntervals.length; i++) {
      expect(reviewIntervals[i]!).toBeGreaterThan(reviewIntervals[i - 1]!);
    }
  });

  it("better ratings never produce shorter intervals", () => {
    const { card, now } = simulate([Rating.Good, Rating.Good, Rating.Good]);
    const p = previewIntervals(card, now, settings);
    expect(p[Rating.Again].getTime()).toBeLessThan(p[Rating.Hard].getTime());
    expect(p[Rating.Hard].getTime()).toBeLessThanOrEqual(p[Rating.Good].getTime());
    expect(p[Rating.Good].getTime()).toBeLessThan(p[Rating.Easy].getTime());
  });

  it("forgetting a review card counts a lapse and moves it to relearning", () => {
    const { card, now } = simulate([Rating.Good, Rating.Good, Rating.Good]);
    expect(card.state).toBe(State.Review);
    const after = review(card, Rating.Again, now, settings).card;
    expect(after.state).toBe(State.Relearning);
    expect(after.lapses).toBe(card.lapses + 1);
    expect(after.stability).toBeLessThan(card.stability);
  });

  it("hard cards get a higher difficulty than easy cards", () => {
    const hard = simulate([Rating.Hard, Rating.Hard, Rating.Hard]).card;
    const easy = simulate([Rating.Easy, Rating.Easy, Rating.Easy]).card;
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty);
  });

  it("respects the maximum interval", () => {
    const capped = { ...settings, maximumInterval: 30 };
    let card = newCardState(t0);
    let now = t0;
    for (let i = 0; i < 12; i++) {
      card = review(card, Rating.Good, now, capped).card;
      now = card.due;
    }
    // ts-fsrs keeps Again < Hard < Good < Easy after capping, so the higher
    // grades may exceed the cap by a day or two – but never grow beyond that.
    expect(card.scheduledDays).toBeLessThanOrEqual(32);
    const next = review(card, Rating.Good, now, capped).card;
    expect(next.scheduledDays).toBe(card.scheduledDays);
  });

  it("a higher requested retention schedules shorter intervals", () => {
    const { card, now } = simulate([Rating.Good, Rating.Good, Rating.Good]);
    const low = review(card, Rating.Good, now, { ...settings, requestRetention: 0.8 }).card;
    const high = review(card, Rating.Good, now, { ...settings, requestRetention: 0.95 }).card;
    expect(high.scheduledDays).toBeLessThan(low.scheduledDays);
  });

  it("rollback restores the exact state before a review (undo)", () => {
    const { card, now } = simulate([Rating.Good, Rating.Good]);
    const { card: after, log } = review(card, Rating.Again, now, settings);
    const restored = rollback(after, log, settings);
    expect(restored.state).toBe(card.state);
    expect(restored.reps).toBe(card.reps);
    expect(restored.lapses).toBe(card.lapses);
    expect(restored.due.getTime()).toBe(card.due.getTime());
    expect(restored.stability).toBeCloseTo(card.stability, 10);
    expect(restored.difficulty).toBeCloseTo(card.difficulty, 10);
  });

  it("retrievability decays over time and is ~requested retention at the due date", () => {
    const { card } = simulate([Rating.Good, Rating.Good, Rating.Good]);
    const atReview = retrievability(card, card.lastReview!, settings);
    const atDue = retrievability(card, card.due, settings);
    const later = retrievability(card, new Date(card.due.getTime() + 30 * DAY), settings);
    expect(atReview).toBeGreaterThan(0.99);
    expect(atDue).toBeGreaterThan(0.85);
    expect(atDue).toBeLessThan(0.95);
    expect(later).toBeLessThan(atDue);
  });
});

describe("mastery", () => {
  it("classifies cards by state and stability", () => {
    expect(masteryLevel(newCardState(t0), t0)).toBe("new");
    expect(masteryLevel(simulate([Rating.Good]).card, t0)).toBe("learning");

    const strong = simulate(Array(8).fill(Rating.Easy)).card;
    expect(masteryLevel(strong, strong.lastReview!, settings)).toBe("mastered");

    // A long-overdue card becomes "shaky" because retrievability dropped.
    const young = simulate([Rating.Good, Rating.Good, Rating.Good]).card;
    const overdueAt = new Date(young.due.getTime() + 200 * DAY);
    expect(retrievability(young, overdueAt, settings)).toBeLessThan(0.8);
    expect(masteryLevel(young, overdueAt, settings)).toBe("shaky");
  });

  it("summarizes progress as the share of solid + mastered cards", () => {
    const strong = simulate(Array(8).fill(Rating.Easy)).card;
    const summary = summarizeMastery([newCardState(t0), strong], strong.lastReview!, settings);
    expect(summary.total).toBe(2);
    expect(summary.counts.new).toBe(1);
    expect(summary.progress).toBeCloseTo(0.5);
  });
});

describe("review queue", () => {
  const candidate = (id: string, state: StoredCardState, extra: Partial<QueueCandidate> = {}): QueueCandidate => ({
    ...state,
    id,
    createdAt: t0,
    ...extra,
  });

  it("orders learning cards first, then reviews by lowest retrievability, then new cards", () => {
    const now = new Date("2026-06-01T09:00:00");
    const learning = candidate("learning", { ...simulate([Rating.Again]).card, due: new Date(now.getTime() - 60_000) });
    const base = simulate([Rating.Good, Rating.Good, Rating.Good]).card;
    const slightlyDue = candidate("slightly", { ...base, due: new Date(now.getTime() - DAY), lastReview: new Date(now.getTime() - 6 * DAY) });
    const veryOverdue = candidate("very", { ...base, due: new Date(now.getTime() - 20 * DAY), lastReview: new Date(now.getTime() - 40 * DAY) });
    const notDue = candidate("future", { ...base, due: new Date(now.getTime() + 5 * DAY) });
    const fresh = candidate("new", newCardState(t0));

    const queue = buildReviewQueue([fresh, notDue, slightlyDue, learning, veryOverdue], { now, newLimit: 10, settings });
    expect(queue.map((c) => c.id)).toEqual(["learning", "very", "slightly", "new"]);
  });

  it("limits the number of new cards and prefers modules with an upcoming exam", () => {
    const now = new Date("2026-06-01T09:00:00");
    const cards = [
      candidate("a", newCardState(t0), { createdAt: new Date(1) }),
      candidate("b", newCardState(t0), { createdAt: new Date(2) }),
      candidate("exam", newCardState(t0), { createdAt: new Date(3), examDate: new Date(now.getTime() + 3 * DAY) }),
    ];
    const queue = buildReviewQueue(cards, { now, newLimit: 2, settings });
    expect(queue.map((c) => c.id)).toEqual(["exam", "a"]);
  });

  it("treats review cards due later today as due, but not tomorrow's", () => {
    const now = new Date("2026-06-01T09:00:00");
    const base = simulate([Rating.Good, Rating.Good, Rating.Good]).card;
    expect(isDue({ ...base, due: new Date("2026-06-01T22:00:00") }, now)).toBe(true);
    expect(isDue({ ...base, due: new Date("2026-06-02T08:00:00") }, now)).toBe(false);
    expect(isDue(newCardState(t0), now)).toBe(false);
  });

  it("computes exam urgency within a three-week window", () => {
    const now = new Date("2026-06-01T09:00:00");
    expect(examUrgency(null, now)).toBe(0);
    expect(examUrgency(new Date(now.getTime() + 60 * DAY), now)).toBe(0);
    expect(examUrgency(now, now)).toBe(1);
    expect(examUrgency(new Date(now.getTime() + 7 * DAY), now)).toBeCloseTo(2 / 3);
  });

  it("forecasts due counts per day, counting overdue cards today", () => {
    const now = new Date("2026-06-01T09:00:00");
    const base = simulate([Rating.Good, Rating.Good, Rating.Good]).card;
    const forecast = dueForecast(
      [
        { ...base, due: new Date("2026-05-20T10:00:00") },
        { ...base, due: new Date("2026-06-01T18:00:00") },
        { ...base, due: new Date("2026-06-03T07:00:00") },
        newCardState(t0),
      ],
      7,
      now,
    );
    expect(forecast.map((f) => f.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
  });
});
