import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ownedModule, ownedNote, resolveAssignment } from "@/server/ownership";
import { grantXp, reward } from "@/server/gamification";
import { XP } from "@/lib/gamification";

let alice: string;
let bob: string;
let aliceSemester: string;
let aliceModule: string;
let aliceNote: string;
let bobModule: string;

beforeAll(async () => {
  const mk = (email: string) => db.user.create({ data: { email, name: email, passwordHash: "x", dailyXpGoal: 20 } });
  alice = (await mk("alice@test.de")).id;
  bob = (await mk("bob@test.de")).id;
  aliceSemester = (await db.semester.create({ data: { userId: alice, name: "S1" } })).id;
  aliceModule = (await db.module.create({ data: { userId: alice, semesterId: aliceSemester, name: "DB" } })).id;
  aliceNote = (await db.note.create({ data: { userId: alice, moduleId: aliceModule, date: new Date() } })).id;
  const bobSemester = (await db.semester.create({ data: { userId: bob, name: "S1" } })).id;
  bobModule = (await db.module.create({ data: { userId: bob, semesterId: bobSemester, name: "Bob DB" } })).id;
});

describe("ownership checks", () => {
  it("does not reveal other users' entities", async () => {
    await expect(ownedModule(alice, bobModule)).rejects.toThrow("nicht gefunden");
    await expect(ownedModule(bob, aliceModule)).rejects.toThrow("nicht gefunden");
    await expect(ownedNote(bob, aliceNote)).rejects.toThrow("nicht gefunden");
    await expect(ownedModule(alice, aliceModule)).resolves.toMatchObject({ id: aliceModule });
  });

  it("derives the semester from a module assignment", async () => {
    await expect(resolveAssignment(alice, { moduleId: aliceModule })).resolves.toEqual({ semesterId: aliceSemester, moduleId: aliceModule });
  });

  it("rejects inconsistent or foreign assignments", async () => {
    await expect(resolveAssignment(alice, { moduleId: bobModule })).rejects.toThrow();
    const s2 = (await db.semester.create({ data: { userId: alice, name: "S2" } })).id;
    await expect(resolveAssignment(alice, { semesterId: s2, moduleId: aliceModule })).rejects.toThrow("gehört nicht");
  });

  it("cascades deletes from semester to modules, sessions and cards", async () => {
    const s = (await db.semester.create({ data: { userId: alice, name: "Tmp" } })).id;
    const m = (await db.module.create({ data: { userId: alice, semesterId: s, name: "Tmp" } })).id;
    const n = (await db.note.create({ data: { userId: alice, moduleId: m, date: new Date() } })).id;
    await db.flashcard.create({ data: { userId: alice, moduleId: m, noteId: n, front: "a", back: "b" } });
    await db.semester.delete({ where: { id: s } });
    expect(await db.module.count({ where: { id: m } })).toBe(0);
    expect(await db.note.count({ where: { id: n } })).toBe(0);
    expect(await db.flashcard.count({ where: { moduleId: m } })).toBe(0);
  });
});

describe("XP ledger", () => {
  it("grants one-time rewards only once", async () => {
    expect(await grantXp(alice, XP.reflect, "reflect", aliceNote)).toBe(XP.reflect);
    expect(await grantXp(alice, XP.reflect, "reflect", aliceNote)).toBe(0);
    expect(await db.xpEvent.count({ where: { userId: alice, reason: "reflect" } })).toBe(1);
  });

  it("adds the daily-goal bonus once and unlocks achievements", async () => {
    const first = await reward(alice, [{ amount: XP.record, reason: "record", refId: aliceNote }]);
    // 20 (reflect) + 10 (record) ≥ goal 20 → bonus
    expect(first.goalReached).toBe(true);
    expect(first.xp).toBe(XP.record + XP.dailyGoal);
    expect(first.achievements.map((a) => a.key)).toContain("first_summary");

    const second = await reward(alice, [{ amount: XP.reduce, reason: "reduce", refId: aliceNote }]);
    expect(second.goalReached).toBe(false);
    expect(second.xp).toBe(XP.reduce);
    expect(second.achievements.map((a) => a.key)).not.toContain("first_summary");
  });

  it("returns no reward for already granted items", async () => {
    const again = await reward(alice, [{ amount: XP.record, reason: "record", refId: aliceNote }]);
    expect(again.xp).toBe(0);
  });
});
