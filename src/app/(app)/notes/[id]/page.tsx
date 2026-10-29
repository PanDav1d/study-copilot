import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getNote } from "@/server/queries/notes";
import { flashcardTopics } from "@/server/queries/flashcards";
import { sessionTitle } from "@/lib/labels";
import { CornellEditor } from "@/components/notes/cornell-editor";
import { db } from "@/lib/db";
import { parseRows, warmupRows } from "@/lib/cornell";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const n = await getNote(user.id, (await params).id);
  return { title: n ? sessionTitle(n) : "Sitzung" };
}

export default async function NotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ focus?: string }> }) {
  const user = await requireUser();
  const note = await getNote(user.id, (await params).id);
  if (!note) notFound();
  const sp = await searchParams;
  const [topics, previous] = await Promise.all([
    flashcardTopics(user.id, note.module.id),
    // The session before this one – its questions are the warm-up for a fresh sheet.
    db.note.findFirst({
      where: { userId: user.id, moduleId: note.module.id, date: { lt: note.date } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true, title: true, date: true, sections: true },
    }),
  ]);
  const warmRows = previous ? warmupRows(parseRows(previous.sections)) : [];
  const warmup = previous && warmRows.length ? { id: previous.id, title: previous.title, date: previous.date, rows: warmRows } : null;
  // `key` resets the editor state when navigating between notes.
  return <CornellEditor key={note.id} note={note} topics={topics} focusSummary={sp.focus === "summary"} warmup={warmup} />;
}
