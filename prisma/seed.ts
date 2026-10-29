/**
 * Demo data for local development: `pnpm db:seed`
 * Creates the user below (if missing) with one semester of example content.
 */
import "dotenv/config";
import { addDays, addWeeks, setHours, startOfWeek } from "date-fns";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { newCardState, review, Rating } from "../src/lib/srs/scheduler";

const DEMO_EMAIL = process.env.SEED_EMAIL ?? "demo@study.local";
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "demo-passwort-2026";

const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }) });

async function main() {
  if (await db.user.findUnique({ where: { email: DEMO_EMAIL } })) {
    console.log(`Seed skipped: ${DEMO_EMAIL} already exists.`);
    return;
  }
  const user = await db.user.create({
    data: { email: DEMO_EMAIL, name: "Demo Studi", passwordHash: await hashPassword(DEMO_PASSWORD) },
  });
  const userId = user.id;
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });

  const semester = await db.semester.create({
    data: { userId, name: "3. Semester – WiSe 26/27", number: 3, startDate: addWeeks(monday, -4), endDate: addWeeks(monday, 10) },
  });

  const dbModule = await db.module.create({
    data: {
      userId, semesterId: semester.id, name: "Datenbanken", code: "T3INF2004", lecturer: "Prof. Dr. Müller", ects: 5, color: "indigo",
      description: "Relationale Datenbanken, SQL, Normalisierung und Transaktionen.",
      examDate: setHours(addWeeks(monday, 6), 9), examType: "KLAUSUR", examDuration: 90, examLocation: "Raum C-301",
      examTopics: "- [ ] ER-Modellierung\n- [ ] Relationale Algebra\n- [ ] SQL (Joins, Gruppierung)\n- [ ] Normalformen 1NF–BCNF\n- [ ] Transaktionen & ACID",
      examNotes: "Hilfsmittel: ein beidseitig handbeschriebenes DIN-A4-Blatt.",
    },
  });
  const mathModule = await db.module.create({
    data: {
      userId, semesterId: semester.id, name: "Mathematik III", code: "T3INF1006", lecturer: "Dr. Schmidt", ects: 5, color: "amber",
      examDate: setHours(addWeeks(monday, 8), 13), examType: "KLAUSUR", examDuration: 120,
    },
  });
  await db.module.create({ data: { userId, semesterId: semester.id, name: "Software Engineering", code: "T3INF2003", ects: 9, color: "emerald" } });

  // Weekly lectures; past ones have a session (Cornell sheet), one is still missing its notes.
  const topics = ["Einführung & ER-Modell", "", "SQL Grundlagen", "Normalisierung"];
  const sessions = [];
  for (let i = 0; i < topics.length; i++) {
    const start = setHours(addWeeks(addDays(monday, 1), i - 3), 9);
    const isLast = i === topics.length - 1;
    const session = isLast
      ? null
      : await db.note.create({
          data: {
            userId, moduleId: dbModule.id, title: topics[i]!, date: start,
            sections: JSON.stringify([{ id: `s${i}`, cue: "", content: "Mitschrift aus der Vorlesung …" }]),
          },
        });
    if (session) sessions.push(session);
    await db.calendarEvent.create({
      data: { userId, type: "LECTURE", title: "Datenbanken", start, end: setHours(start, 12), moduleId: dbModule.id, noteId: session?.id, location: "Raum A-112" },
    });
  }
  for (let i = 1; i <= 3; i++) {
    const start = setHours(addWeeks(addDays(monday, 1), i), 9);
    await db.calendarEvent.create({ data: { userId, type: "LECTURE", title: "Datenbanken", start, end: setHours(start, 12), moduleId: dbModule.id, location: "Raum A-112" } });
  }
  await db.calendarEvent.create({
    data: { userId, type: "STUDY", title: "Lernen: Normalformen", start: setHours(now, 17), end: setHours(now, 18), moduleId: dbModule.id, topic: "Normalisierung" },
  });

  const lastLecture = setHours(addWeeks(addDays(monday, 1), -1), 9);
  const note = await db.note.create({
    data: {
      userId, moduleId: dbModule.id, title: "Normalisierung", date: lastLecture,
      sections: JSON.stringify([
        { id: "r1", cue: "Warum normalisieren?", content: "Redundanzen und **Anomalien** vermeiden:\n- Einfüge-Anomalie\n- Lösch-Anomalie\n- Update-Anomalie" },
        { id: "r2", cue: "Was ist eine funktionale Abhängigkeit?", content: "X → Y: Gleiche X-Werte implizieren gleiche Y-Werte." },
        { id: "r3", cue: "Wann ist eine Relation in 1NF?", content: "Wenn alle Attributwerte **atomar** sind (keine Listen, keine zusammengesetzten Werte)." },
        { id: "r4", cue: "Was fordert die 2NF?", content: "1NF + kein Nicht-Schlüsselattribut ist nur von einem *Teil* eines zusammengesetzten Schlüssels abhängig." },
        { id: "r5", cue: "Was fordert die 3NF?", content: "2NF + keine **transitiven** Abhängigkeiten von Nicht-Schlüsselattributen." },
        { id: "r6", cue: "BCNF", content: "Jede Determinante ist ein Schlüsselkandidat (strenger als 3NF)." },
      ]),
      summary: "Normalisierung zerlegt Relationen schrittweise, um Redundanz und Anomalien zu vermeiden. Jede NF baut auf der vorherigen auf.",
    },
  });

  const cards: [string, string, string][] = [
    ["Was ist eine funktionale Abhängigkeit?", "X → Y: Gleiche X-Werte implizieren gleiche Y-Werte.", "Normalisierung"],
    ["Wann ist eine Relation in 1NF?", "Wenn alle Attributwerte atomar sind.", "Normalisierung"],
    ["Was bedeutet ACID?", "**A**tomicity, **C**onsistency, **I**solation, **D**urability", "Transaktionen"],
    ["Unterschied INNER JOIN vs. LEFT JOIN?", "LEFT JOIN behält alle Zeilen der linken Tabelle, auch ohne Partner.", "SQL"],
    ["Was ist ein Fremdschlüssel?", "Attribut(e), die auf den Primärschlüssel einer anderen Relation verweisen.", "ER-Modell"],
    ["Was ist ein Schlüsselkandidat?", "Minimale Attributmenge, die jedes Tupel eindeutig identifiziert.", "ER-Modell"],
  ];
  for (const [i, [front, back, topic]] of cards.entries()) {
    let state = newCardState(addDays(now, -20));
    const card = await db.flashcard.create({
      data: { userId, moduleId: dbModule.id, noteId: i < 2 ? note.id : null, front, back, topic, ...state, createdAt: addDays(now, -20) },
    });
    // Give some cards a review history so the dashboard has something to show.
    if (i < 4) {
      let t = addDays(now, -20 + i);
      for (const g of [Rating.Good, Rating.Good, i === 2 ? Rating.Again : Rating.Good] as const) {
        const r = review(state, g, t);
        await db.reviewLog.create({ data: { ...r.log, userId, flashcardId: card.id } });
        state = r.card;
        t = r.card.due;
      }
      await db.flashcard.update({ where: { id: card.id }, data: { ...state, due: addDays(now, i - 2) } });
    }
  }
  await db.flashcard.create({
    data: { userId, moduleId: mathModule.id, front: "Ableitung von $\\sin(x)$?", back: "$\\cos(x)$", topic: "Analysis", ...newCardState() },
  });

  // A little XP history so level, streak and heatmap have something to show.
  for (let d = 1; d <= 9; d++) {
    if (d === 6) continue; // one missed day → streak of 5
    await db.xpEvent.create({ data: { userId, amount: 20 + ((d * 17) % 45), reason: "review", refId: `seed-${d}`, createdAt: addDays(now, -d) } });
  }
  await db.userAchievement.create({ data: { userId, key: "first_session" } });

  console.log(`Seeded demo data for ${DEMO_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
