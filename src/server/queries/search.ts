import "server-only";
import { db } from "@/lib/db";

/** Simple full-text-ish search across all content (SQLite LIKE, case-insensitive for ASCII). */
export async function searchAll(userId: string, q: string) {
  const query = q.trim();
  if (query.length < 2) return null;
  const take = 20;
  const [modules, notes, flashcards, documents, events] = await Promise.all([
    db.module.findMany({
      where: { userId, OR: [{ name: { contains: query } }, { code: { contains: query } }, { description: { contains: query } }, { examTopics: { contains: query } }, { summaryNote: { contains: query } }] },
      take,
      select: { id: true, name: true, color: true, code: true, semester: { select: { name: true } } },
    }),
    db.note.findMany({
      where: { userId, OR: [{ title: { contains: query } }, { sections: { contains: query } }, { summary: { contains: query } }] },
      take,
      orderBy: { date: "desc" },
      select: { id: true, title: true, date: true, sections: true, summary: true, module: { select: { name: true, color: true } } },
    }),
    db.flashcard.findMany({
      where: { userId, OR: [{ front: { contains: query } }, { back: { contains: query } }, { topic: { contains: query } }] },
      take,
      select: { id: true, front: true, back: true, module: { select: { name: true, color: true } } },
    }),
    db.document.findMany({
      where: { userId, OR: [{ title: { contains: query } }, { originalName: { contains: query } }, { description: { contains: query } }] },
      take,
      select: { id: true, title: true, originalName: true, module: { select: { name: true, color: true } } },
    }),
    db.calendarEvent.findMany({
      where: { userId, OR: [{ title: { contains: query } }, { description: { contains: query } }] },
      take,
      orderBy: { start: "desc" },
      select: { id: true, title: true, start: true, type: true, module: { select: { name: true, color: true } } },
    }),
  ]);
  return { modules, notes, flashcards, documents, events };
}

/** A short snippet around the first match. */
export function snippet(text: string, q: string, radius = 70) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}
