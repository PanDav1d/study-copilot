import type { Metadata } from "next";
import { CheckCircle2, NotebookPen } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listNotes } from "@/server/queries/notes";
import { openSummaryCount } from "@/server/queries/tasks";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkTabs } from "@/components/ui/tabs";
import { NoteList } from "@/components/notes/note-list";
import { NewNoteButton } from "@/components/structure/actions";
import { ListFilters } from "@/components/list-filters";

export const metadata: Metadata = { title: "Sitzungen" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ module?: string; q?: string; status?: string }> }) {
  const user = await requireUser();
  const { module, q, status } = await searchParams;
  const missingSummary = status === "open";
  const [notes, openCount] = await Promise.all([
    listNotes(user.id, { moduleId: module, q, missingSummary }),
    openSummaryCount(user.id),
  ]);
  const href = (s?: string) => {
    const p = new URLSearchParams({ ...(module && { module }), ...(q && { q }), ...(s && { status: s }) });
    return `/notes${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Sitzungen" description="Deine Cornell-Mitschriften – eine pro Vorlesungstag." actions={<NewNoteButton moduleId={module} />} />
      <LinkTabs
        className="mb-5"
        active={missingSummary ? "open" : "all"}
        tabs={[
          { key: "all", label: "Alle", href: href() },
          { key: "open", label: "Zusammenfassung fehlt", href: href("open"), count: openCount },
        ]}
      />
      <ListFilters fields={["q", "module"]} />
      {notes.length === 0 ? (
        missingSummary ? (
          <EmptyState icon={CheckCircle2} title="Alles zusammengefasst" description="Zu jeder vergangenen Sitzung gibt es eine Zusammenfassung. Stark!" />
        ) : (
          <EmptyState icon={NotebookPen} title={q || module ? "Keine passenden Sitzungen" : "Noch keine Sitzungen"} description="Lege für jeden Vorlesungstag eine Sitzung an – oder lass sie aus wöchentlichen Kalenderterminen entstehen." action={<NewNoteButton moduleId={module} />} />
        )
      ) : (
        <NoteList notes={notes} showModule={!module} />
      )}
    </>
  );
}
