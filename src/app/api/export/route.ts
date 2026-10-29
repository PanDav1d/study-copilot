import { NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";

export const runtime = "nodejs";

/** Full JSON export of the user's data (backup / portability). Files are not included. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const where = { userId: user.id };
  const [semesters, modules, notes, flashcards, reviewLogs, documents, events, noteDocuments, flashcardDocuments, xpEvents, achievements] =
    await Promise.all([
      db.semester.findMany({ where }),
      db.module.findMany({ where }),
      db.note.findMany({ where }),
      db.flashcard.findMany({ where }),
      db.reviewLog.findMany({ where }),
      db.document.findMany({ where, omit: { storageKey: true } }),
      db.calendarEvent.findMany({ where }),
      db.noteDocument.findMany({ where: { note: where } }),
      db.flashcardDocument.findMany({ where: { flashcard: where } }),
      db.xpEvent.findMany({ where }),
      db.userAchievement.findMany({ where }),
    ]);

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: 2,
      user: { name: user.name, email: user.email },
      semesters, modules, notes, flashcards, reviewLogs, documents, events, noteDocuments, flashcardDocuments, xpEvents, achievements,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="study-copilot-export-${format(new Date(), "yyyy-MM-dd")}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
