import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syncExamGroup, type ExamFields } from "@/server/exam-groups";
import { findEventForSession, findSessionForEvent } from "@/server/session-links";
import { mergeSharedExams } from "@/server/queries/calendar";

let user: string;
let semester: string;

const exam: ExamFields = {
  examDate: new Date(2027, 1, 10, 9),
  examType: "KLAUSUR",
  examDuration: 120,
  examLocation: "Aula",
  examTopics: "- Analysis",
  examNotes: "",
};

const mkModule = async (name: string) => (await db.module.create({ data: { userId: user, semesterId: semester, name } })).id;

beforeAll(async () => {
  user = (await db.user.create({ data: { email: "linking@test.de", name: "L", passwordHash: "x" } })).id;
  semester = (await db.semester.create({ data: { userId: user, name: "S3" } })).id;
});

describe("shared exams", () => {
  it("groups modules, copies the exam data and dissolves single-member groups", async () => {
    const [m1, m2, m3] = [await mkModule("Mathe I"), await mkModule("Mathe II"), await mkModule("Statistik")];
    await db.$transaction((tx) => syncExamGroup(tx, user, m1, [m2, m3], exam));
    const grouped = await db.module.findMany({ where: { id: { in: [m1, m2, m3] } } });
    const group = grouped[0]!.examGroupId;
    expect(group).toBeTruthy();
    for (const m of grouped) expect(m).toMatchObject({ examGroupId: group, examLocation: "Aula", examDuration: 120 });

    // Unticking Statistik removes it; it keeps its copy of the data.
    await db.$transaction((tx) => syncExamGroup(tx, user, m1, [m2], { ...exam, examLocation: "Raum 1" }));
    expect(await db.module.findUniqueOrThrow({ where: { id: m3 } })).toMatchObject({ examGroupId: null, examLocation: "Aula" });
    expect(await db.module.findUniqueOrThrow({ where: { id: m2 } })).toMatchObject({ examGroupId: group, examLocation: "Raum 1" });

    // Leaving a two-module group dissolves it.
    await db.$transaction((tx) => syncExamGroup(tx, user, m2, [], exam));
    expect(await db.module.count({ where: { examGroupId: group } })).toBe(0);
  });

  it("rejects foreign modules", async () => {
    const m = await mkModule("X");
    await expect(db.$transaction((tx) => syncExamGroup(tx, user, m, ["doesnotexist"], exam))).rejects.toThrow("nicht gefunden");
  });

  it("shows a shared exam once", () => {
    const merged = mergeSharedExams([
      { name: "Mathe I", examGroupId: "g" },
      { name: "Physik", examGroupId: null },
      { name: "Mathe II", examGroupId: "g" },
    ]);
    expect(merged.map((m) => m.name)).toEqual(["Mathe I + Mathe II", "Physik"]);
  });
});

describe("session ↔ calendar linking", () => {
  it("finds the lecture of the same day and module, preferring lectures", async () => {
    const m = await mkModule("Datenbanken");
    const other = await mkModule("Netze");
    const day = new Date(2026, 10, 3);
    const at = (h: number) => new Date(2026, 10, 3, h);
    await db.calendarEvent.create({ data: { userId: user, moduleId: m, type: "STUDY", title: "Lernen", start: at(7), end: at(8) } });
    await db.calendarEvent.create({ data: { userId: user, moduleId: other, type: "LECTURE", title: "Netze", start: at(8), end: at(9) } });
    await db.calendarEvent.create({ data: { userId: user, moduleId: m, type: "OTHER", title: "Tutorium", start: at(9), end: at(10) } });
    const lecture = await db.calendarEvent.create({ data: { userId: user, moduleId: m, type: "LECTURE", title: "DB", start: at(13), end: at(15) } });

    expect((await findEventForSession(db, user, m, day))?.id).toBe(lecture.id);
    expect(await findEventForSession(db, user, m, new Date(2026, 10, 4))).toBeNull();

    // Once the lecture has a session, a second session of that day does not steal it.
    const note = await db.note.create({ data: { userId: user, moduleId: m, date: day } });
    await db.calendarEvent.update({ where: { id: lecture.id }, data: { noteId: note.id } });
    expect((await findEventForSession(db, user, m, day))?.type).toBe("OTHER");
  });

  it("finds an unlinked session for a new lecture", async () => {
    const m = await mkModule("Algorithmen");
    const day = new Date(2026, 10, 5);
    expect(await findSessionForEvent(db, user, m, new Date(2026, 10, 5, 10))).toBeNull();
    const note = await db.note.create({ data: { userId: user, moduleId: m, date: day } });
    expect((await findSessionForEvent(db, user, m, new Date(2026, 10, 5, 10)))?.id).toBe(note.id);
    await db.calendarEvent.create({ data: { userId: user, moduleId: m, noteId: note.id, type: "LECTURE", title: "Algo", start: new Date(2026, 10, 5, 8), end: new Date(2026, 10, 5, 9) } });
    expect(await findSessionForEvent(db, user, m, new Date(2026, 10, 5, 10))).toBeNull();
  });
});
