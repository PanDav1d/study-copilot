import "server-only";
import { format } from "date-fns";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { newRowId, nonEmptyRows, parseRows, rowsText } from "@/lib/cornell";
import { db } from "@/lib/db";
import { eventSchema, flashcardBulkSchema, id, noteCreateSchema, noteUpdateSchema } from "@/lib/validation";
import type { CurrentUser } from "@/server/auth";
import { UserError } from "@/server/errors";
import { reviewQueue } from "@/server/queries/flashcards";
import { getNote, listNotes } from "@/server/queries/notes";
import { searchAll, snippet } from "@/server/queries/search";
import { getModule } from "@/server/queries/structure";
import { openTasks } from "@/server/queries/tasks";
import { createEvent } from "@/server/services/events";
import { createFlashcards } from "@/server/services/flashcards";
import { appendSummaryNote } from "@/server/services/modules";
import { appendRows, createNote, updateNote } from "@/server/services/notes";

/**
 * MCP server exposing the study data of one user to Claude (or any MCP client):
 * read modules and Cornell sessions, add notes, write summaries, create flashcards
 * and study blocks. Deliberately no delete tools – the app stays the place for that.
 * All writes go through the same validation and services as the web app.
 */

const userSelect = {
  id: true, email: true, name: true, updatedAt: true, requestRetention: true,
  maximumInterval: true, enableFuzz: true, dailyNewLimit: true, dailyXpGoal: true,
} as const;

/** The user the server acts for: `MCP_USER_EMAIL`, or the only account in the database. */
export async function resolveUser(email = process.env.MCP_USER_EMAIL): Promise<CurrentUser> {
  if (email) {
    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: userSelect });
    if (!user) throw new Error(`Kein Konto mit der E-Mail ${email} gefunden.`);
    return user;
  }
  const users = await db.user.findMany({ select: userSelect, take: 2 });
  if (users.length === 0) throw new Error("Die Datenbank enthält noch kein Konto. Bitte zuerst in der App registrieren.");
  if (users.length > 1) throw new Error("Mehrere Konten vorhanden – bitte MCP_USER_EMAIL setzen.");
  return users[0]!;
}

/** Dates as local time with offset, so "Vorlesung am 21.10." stays the 21st for the model. */
function json(value: unknown): CallToolResult {
  const text = JSON.stringify(
    value,
    function (key, v) {
      const raw = (this as Record<string, unknown>)[key];
      return raw instanceof Date ? format(raw, "yyyy-MM-dd'T'HH:mmXXX") : v;
    },
    1,
  );
  return { content: [{ type: "text", text }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Maps validation and domain errors to tool errors the model can react to. */
async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof z.ZodError) return fail(`Ungültige Eingabe:\n${z.prettifyError(error)}`);
    if (error instanceof UserError) return fail(error.message);
    console.error("[mcp] unexpected error", error);
    return fail("Unerwarteter Fehler im Study-Copilot-Server.");
  }
}

const idArg = z.string().describe("ID aus einem vorherigen Tool-Ergebnis");
const dateArg = z.string().describe('Lokales Datum "YYYY-MM-DD" oder Datum mit Uhrzeit "YYYY-MM-DDTHH:mm"');
const rowArg = z.object({
  cue: z.string().describe("Linke Spalte: Stichwort oder Frage"),
  content: z.string().describe("Rechte Spalte: Notizen in Markdown. PDF-Verweise als [Titel S. 5](doc:<documentId>#page=5)"),
});
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const additive = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const INSTRUCTIONS = `Study Copilot: persönlicher Lernbegleiter für das DHBW-Studium.
Struktur: Semester → Modul → Sitzung. Eine Sitzung ist die Cornell-Mitschrift eines Vorlesungstags:
Zeilen aus Stichwort/Frage (cue, links) und Notizen (content, rechts) plus eine Zusammenfassung unten.
Karteikarten gehören zu einem Modul, optional zu einer Sitzung, und werden mit FSRS wiederholt.
Arbeitsweise: IDs immer über list_modules / list_sessions / search ermitteln, nie raten.
Schreibe Inhalte auf Deutsch, in Markdown, knapp und prüfungsorientiert. Zusammenfassungen: 3–6 Sätze in eigenen Worten,
die die Kernideen der Sitzung verbinden. Karteikarten: eine Idee pro Karte, Frage vorne, präzise Antwort hinten, keine Duplikate.
Lösche oder überschreibe nichts ungefragt: Notizen werden angehängt, eine bestehende Zusammenfassung nur auf ausdrücklichen Wunsch ersetzt.`;

export interface StudyServerOptions {
  /** Returns a reason when writing is not allowed right now (e.g. the data folder is open on another Mac). */
  writeGuard?: () => string | null;
}

export function createStudyServer(user: CurrentUser, { writeGuard }: StudyServerOptions = {}) {
  const server = new McpServer({ name: "study-copilot", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const userId = user.id;
  const write = (fn: () => Promise<CallToolResult>) =>
    run(async () => {
      const blocked = writeGuard?.();
      return blocked ? fail(blocked) : fn();
    });

  // --- Read ------------------------------------------------------------------

  server.registerTool(
    "list_modules",
    {
      title: "Semester und Module",
      description: "Alle Semester mit ihren Modulen (IDs, Prüfungstermin, Anzahl Sitzungen und Karteikarten).",
      annotations: readOnly,
    },
    () =>
      run(async () => {
        const semesters = await db.semester.findMany({
          where: { userId },
          orderBy: [{ number: "desc" }, { createdAt: "desc" }],
          select: {
            id: true, name: true, number: true, startDate: true, endDate: true,
            modules: {
              orderBy: { name: "asc" },
              select: {
                id: true, name: true, code: true, lecturer: true, ects: true, room: true, examDate: true, examType: true,
                _count: { select: { notes: true, flashcards: true, documents: true } },
              },
            },
          },
        });
        return json(semesters);
      }),
  );

  server.registerTool(
    "get_module",
    {
      title: "Modul im Detail",
      description: "Beschreibung, Prüfungsinfos (Termin, Form, Inhalte), die Modul-Zusammenfassung zur Prüfungsvorbereitung, Lernstand der Karteikarten, Themen, Sitzungsliste und kommende Termine eines Moduls.",
      inputSchema: { moduleId: idArg },
      annotations: readOnly,
    },
    ({ moduleId }) =>
      run(async () => {
        const mod = await getModule(user, moduleId);
        if (!mod) return fail("Modul wurde nicht gefunden.");
        return json({
          id: mod.id, name: mod.name, code: mod.code, lecturer: mod.lecturer, ects: mod.ects, room: mod.room,
          semester: mod.semester, description: mod.description,
          exam: {
            date: mod.examDate, type: mod.examType, durationMinutes: mod.examDuration, location: mod.examLocation,
            topics: mod.examTopics, notes: mod.examNotes, sharedWith: mod.examPartners.map((p) => p.name),
          },
          summaryNote: mod.summaryNote,
          flashcards: { dueToday: mod.dueCount, mastery: mod.mastery, topics: mod.topics },
          sessions: mod.notes.map((n) => ({
            id: n.id, date: n.date, title: n.title,
            rows: nonEmptyRows(parseRows(n.sections)).length, hasSummary: !!n.summary.trim(), flashcards: n._count.flashcards,
          })),
          documents: mod.documents.map((d) => ({ id: d.id, title: d.title })),
          upcomingEvents: mod.calendarEvents.map((e) => ({ id: e.id, type: e.type, title: e.title, start: e.start, end: e.end, location: e.location })),
        });
      }),
  );

  server.registerTool(
    "list_sessions",
    {
      title: "Sitzungen auflisten",
      description: "Sitzungen (Cornell-Mitschriften), neueste zuerst. Optional nach Modul, Suchbegriff oder fehlender Zusammenfassung gefiltert.",
      inputSchema: {
        moduleId: idArg.optional(),
        query: z.string().optional().describe("Sucht in Thema, Notizen und Zusammenfassung"),
        missingSummary: z.boolean().optional().describe("Nur vergangene Sitzungen ohne Zusammenfassung"),
        limit: z.number().int().min(1).max(200).optional().describe("Standard 30"),
      },
      annotations: readOnly,
    },
    ({ moduleId, query, missingSummary, limit }) =>
      run(async () => {
        const notes = await listNotes(userId, { moduleId, q: query?.trim() || undefined, missingSummary });
        return json(
          notes.slice(0, limit ?? 30).map((n) => ({
            id: n.id, date: n.date, title: n.title, module: { id: n.module.id, name: n.module.name },
            rows: nonEmptyRows(parseRows(n.sections)).length, summary: n.summary, flashcards: n._count.flashcards,
          })),
        );
      }),
  );

  server.registerTool(
    "get_session",
    {
      title: "Sitzung lesen",
      description: "Vollständige Cornell-Mitschrift einer Sitzung: alle Zeilen, Zusammenfassung, verknüpfte PDFs, vorhandene Karteikarten und die zugehörige Vorlesung.",
      inputSchema: { sessionId: idArg },
      annotations: readOnly,
    },
    ({ sessionId }) =>
      run(async () => {
        const note = await getNote(userId, sessionId);
        if (!note) return fail("Sitzung wurde nicht gefunden.");
        return json({
          id: note.id, date: note.date, title: note.title,
          module: { id: note.module.id, name: note.module.name, semester: note.module.semester.name },
          rows: nonEmptyRows(parseRows(note.sections)).map(({ cue, content }) => ({ cue, content })),
          summary: note.summary,
          lastRecall: note.recallAt ? { at: note.recallAt, score: note.recallScore } : null,
          documents: note.documents.map((d) => ({ id: d.document.id, title: d.document.title })),
          flashcards: note.flashcards.map((c) => c.front),
          lecture: note.calendarEvents[0] ?? null,
        });
      }),
  );

  server.registerTool(
    "search",
    {
      title: "Suchen",
      description: "Globale Suche über Module, Sitzungen, Karteikarten, PDFs und Termine (mind. 2 Zeichen).",
      inputSchema: { query: z.string().min(2) },
      annotations: readOnly,
    },
    ({ query }) =>
      run(async () => {
        const r = await searchAll(userId, query);
        if (!r) return fail("Suchbegriff ist zu kurz.");
        return json({
          modules: r.modules.map((m) => ({ id: m.id, name: m.name, code: m.code, semester: m.semester.name })),
          sessions: r.notes.map((n) => ({
            id: n.id, date: n.date, title: n.title, module: n.module.name,
            snippet: snippet(`${rowsText(parseRows(n.sections))}\n${n.summary}`, query),
          })),
          flashcards: r.flashcards.map((c) => ({ id: c.id, front: c.front, back: c.back, module: c.module.name })),
          documents: r.documents.map((d) => ({ id: d.id, title: d.title, module: d.module?.name ?? null })),
          events: r.events.map((e) => ({ id: e.id, title: e.title, start: e.start, type: e.type, module: e.module?.name ?? null })),
        });
      }),
  );

  server.registerTool(
    "get_open_tasks",
    {
      title: "Offene Aufgaben",
      description: "Was gerade ansteht: Sitzungen ohne Zusammenfassung, Vorlesungen ohne Mitschrift (letzte 14 Tage), verpasste Lerneinheiten.",
      annotations: readOnly,
    },
    () =>
      run(async () => {
        const t = await openTasks(userId);
        return json({
          sessionsWithoutSummary: { total: t.summaryTotal, latest: t.summaries.map((s) => ({ id: s.id, date: s.date, title: s.title, module: s.module.name, empty: s.empty, daysOpen: s.daysOpen })) },
          lecturesWithoutNotes: { total: t.lectureTotal, latest: t.lectures.map((l) => ({ eventId: l.id, title: l.title, start: l.start, module: { id: l.module.id, name: l.module.name } })) },
          missedStudyBlocks: t.studyTasks.map((s) => ({ id: s.id, title: s.title, start: s.start, topic: s.topic, module: s.module?.name ?? null })),
        });
      }),
  );

  server.registerTool(
    "get_due_cards",
    {
      title: "Fällige Karteikarten",
      description: "Die FSRS-Warteschlange von heute (fällige Wiederholungen + neue Karten im Tageslimit), z. B. um gemeinsam abzufragen. Bewertet werden Karten weiterhin in der App.",
      inputSchema: { moduleId: idArg.optional(), topic: z.string().optional(), limit: z.number().int().min(1).max(100).optional().describe("Standard 20") },
      annotations: readOnly,
    },
    ({ moduleId, topic, limit }) =>
      run(async () => {
        const queue = await reviewQueue(user, { moduleId, topic, mode: "due", limit: limit ?? 20 });
        return json(queue.map((c) => ({ id: c.id, front: c.front, back: c.back, topic: c.topic, module: c.module.name, isNew: c.state === 0, lapses: c.lapses })));
      }),
  );

  // --- Write -----------------------------------------------------------------

  server.registerTool(
    "create_session",
    {
      title: "Sitzung anlegen",
      description: "Legt eine neue Sitzung (Cornell-Mitschrift) für ein Modul an, optional direkt mit Zeilen und Zusammenfassung. Eine Vorlesung desselben Tages im Kalender wird automatisch verknüpft.",
      inputSchema: {
        moduleId: idArg,
        date: dateArg,
        title: z.string().optional().describe("Thema, optional"),
        rows: z.array(rowArg).optional(),
        summary: z.string().optional(),
      },
      annotations: additive,
    },
    ({ moduleId, date, title, rows, summary }) =>
      write(async () => {
        const created = await createNote(userId, noteCreateSchema.parse({ moduleId, date, title }));
        let xp = 0;
        if (rows?.length || summary) {
          const sections = rows?.map((r) => ({ id: newRowId(), ...r }));
          const result = await updateNote(userId, noteUpdateSchema.parse({ id: created.id, sections, summary }));
          xp = result.reward.xp;
        }
        return json({ sessionId: created.id, linkedLecture: created.linkedEvent, xp });
      }),
  );

  server.registerTool(
    "append_cornell_rows",
    {
      title: "Notizen ergänzen",
      description: "Hängt Zeilen (Stichwort/Frage + Notizen) unten an eine bestehende Sitzung an. Vorhandene Zeilen bleiben unverändert.",
      inputSchema: { sessionId: idArg, rows: z.array(rowArg).min(1).max(100) },
      annotations: additive,
    },
    ({ sessionId, rows }) =>
      write(async () => {
        const result = await appendRows(userId, id.parse(sessionId), rows);
        return json({ sessionId, rowCount: result.rowCount, xp: result.reward.xp });
      }),
  );

  server.registerTool(
    "append_module_summary",
    {
      title: "Modul-Zusammenfassung ergänzen",
      description: "Hängt Markdown unten an die Zusammenfassung zur Prüfungsvorbereitung eines Moduls an (eine freie Notiz pro Modul, kein Cornell). Vorhandener Text bleibt unverändert.",
      inputSchema: { moduleId: idArg, text: z.string().min(1).max(50_000).describe("Markdown, z. B. mit Überschrift pro Thema") },
      annotations: additive,
    },
    ({ moduleId, text }) =>
      write(async () => {
        const result = await appendSummaryNote(userId, id.parse(moduleId), text);
        return json({ moduleId, length: result.length, updatedAt: result.updatedAt });
      }),
  );

  server.registerTool(
    "update_session",
    {
      title: "Sitzung aktualisieren",
      description: "Setzt Zusammenfassung, Thema oder Datum einer Sitzung. Nur übergebene Felder werden geändert. Eine bestehende Zusammenfassung wird ersetzt – vorher mit get_session prüfen.",
      inputSchema: { sessionId: idArg, summary: z.string().optional(), title: z.string().optional(), date: dateArg.optional() },
      annotations: { ...additive, idempotentHint: true },
    },
    ({ sessionId, summary, title, date }) =>
      write(async () => {
        const result = await updateNote(userId, noteUpdateSchema.parse({ id: sessionId, summary, title, date }));
        return json({ sessionId, updatedAt: result.updatedAt, xp: result.reward.xp });
      }),
  );

  server.registerTool(
    "create_flashcards",
    {
      title: "Karteikarten anlegen",
      description: "Legt bis zu 200 Karteikarten in einem Modul an, optional mit einer Sitzung und einem Thema verknüpft. Vorher mit get_session prüfen, welche Karten es schon gibt.",
      inputSchema: {
        moduleId: idArg,
        sessionId: idArg.optional(),
        topic: z.string().optional().describe("Thema für alle Karten, z. B. \"Kostenrechnung\""),
        cards: z.array(z.object({ front: z.string().describe("Frage (Markdown)"), back: z.string().describe("Antwort (Markdown)") })).min(1).max(200),
      },
      annotations: additive,
    },
    ({ moduleId, sessionId, topic, cards }) =>
      write(async () => {
        const result = await createFlashcards(userId, flashcardBulkSchema.parse({ moduleId, noteId: sessionId, topic, cards }));
        return json({ created: result.count, ids: result.ids, xp: result.reward.xp });
      }),
  );

  server.registerTool(
    "create_study_block",
    {
      title: "Lerneinheit planen",
      description: "Trägt eine Lerneinheit in den Kalender ein, optional mit Modul, Sitzung und Thema verknüpft (startet in der App direkt die passende Lernsitzung).",
      inputSchema: {
        title: z.string(),
        start: dateArg,
        end: dateArg,
        moduleId: idArg.optional(),
        sessionId: idArg.optional(),
        topic: z.string().optional().describe("Karteikarten-Thema"),
        description: z.string().optional(),
        location: z.string().optional(),
      },
      annotations: additive,
    },
    ({ title, start, end, moduleId, sessionId, topic, description, location }) =>
      write(async () => {
        const input = eventSchema.parse({ type: "STUDY", title, start, end, moduleId, noteId: sessionId, topic, description, location });
        const { ids } = await createEvent(userId, input);
        return json({ eventId: ids[0] });
      }),
  );

  // --- Prompts (show up as slash commands in Claude Desktop) -------------------

  server.registerPrompt(
    "sitzung_nachbereiten",
    {
      title: "Sitzung nachbereiten",
      description: "Zusammenfassung schreiben und Karteikarten aus einer Sitzung erstellen.",
      argsSchema: { sessionId: z.string().describe("ID der Sitzung") },
    },
    ({ sessionId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Bereite die Sitzung ${sessionId} nach: Lies sie mit get_session. Fehlt die Zusammenfassung, schreibe eine (3–6 Sätze) und speichere sie mit update_session. Schlage dann Karteikarten für Inhalte vor, die noch keine Karte haben, und lege sie nach meiner Bestätigung mit create_flashcards an.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "pruefung_vorbereiten",
    {
      title: "Prüfung vorbereiten",
      description: "Lernstand eines Moduls einschätzen und Lerneinheiten bis zur Prüfung planen.",
      argsSchema: { moduleId: z.string().describe("ID des Moduls") },
    },
    ({ moduleId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hilf mir bei der Prüfungsvorbereitung für Modul ${moduleId}: Lies es mit get_module, vergleiche die Prüfungsinhalte mit meinen Sitzungen und dem Lernstand der Karteikarten, nenne Lücken und schlage einen Lernplan bis zum Prüfungstermin vor. Trage Lerneinheiten erst nach meiner Bestätigung mit create_study_block ein.`,
          },
        },
      ],
    }),
  );

  return server;
}
