import "server-only";
import { db } from "@/lib/db";
import { NotFoundError, UserError } from "./errors";

/**
 * Ownership checks for ids coming from the client. Every referenced entity
 * must belong to the current user – otherwise we act as if it did not exist.
 */
export async function ownedSemester(userId: string, id: string) {
  const s = await db.semester.findFirst({ where: { id, userId }, select: { id: true } });
  if (!s) throw new NotFoundError("Semester");
  return s;
}

export async function ownedModule(userId: string, id: string) {
  const m = await db.module.findFirst({ where: { id, userId }, select: { id: true, semesterId: true } });
  if (!m) throw new NotFoundError("Modul");
  return m;
}

export async function ownedNote(userId: string, id: string) {
  const n = await db.note.findFirst({ where: { id, userId }, select: { id: true, moduleId: true } });
  if (!n) throw new NotFoundError("Sitzung");
  return n;
}

export async function ownedFlashcard(userId: string, id: string) {
  const c = await db.flashcard.findFirst({ where: { id, userId } });
  if (!c) throw new NotFoundError("Karteikarte");
  return c;
}

export async function ownedDocument(userId: string, id: string) {
  const d = await db.document.findFirst({ where: { id, userId } });
  if (!d) throw new NotFoundError("Dokument");
  return d;
}

export async function ownedDocuments(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const docs = await db.document.findMany({ where: { id: { in: unique }, userId }, select: { id: true } });
  if (docs.length !== unique.length) throw new NotFoundError("Dokument");
  return docs;
}

export async function ownedEvent(userId: string, id: string) {
  const e = await db.calendarEvent.findFirst({ where: { id, userId } });
  if (!e) throw new NotFoundError("Termin");
  return e;
}

/** Validates an optional semester/module assignment for consistency. */
export async function resolveAssignment(userId: string, input: { semesterId?: string | null; moduleId?: string | null }) {
  let semesterId = input.semesterId ?? null;
  const moduleId = input.moduleId ?? null;

  if (moduleId) {
    const mod = await ownedModule(userId, moduleId);
    if (semesterId && semesterId !== mod.semesterId) {
      throw new UserError("Das Modul gehört nicht zu diesem Semester.");
    }
    semesterId = mod.semesterId;
  } else if (semesterId) {
    await ownedSemester(userId, semesterId);
  }
  return { semesterId, moduleId };
}
