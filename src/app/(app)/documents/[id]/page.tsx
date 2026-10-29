import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, FileText, Layers, NotebookPen, Settings2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getDocument } from "@/server/queries/documents";
import { fmtDate } from "@/lib/dates";
import { formatBytes } from "@/lib/utils";
import { ModuleTag } from "@/components/ui/misc";
import { DocumentMenu } from "@/components/documents/document-menu";
import { PdfViewer } from "@/components/pdf/lazy-viewer";
import { sessionLabel } from "@/lib/labels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const d = await getDocument(user.id, (await params).id);
  return { title: d?.title ?? "Unterlage" };
}

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const doc = await getDocument(user.id, (await params).id);
  if (!doc) notFound();
  const page = Number((await searchParams).page);
  const links = doc.notes.length + doc.flashcards.length + doc.calendarEvents.length;

  return (
    // Full height of the pane: the viewer scrolls itself.
    <div data-wide data-bleed className="flex h-[var(--pane-h)] flex-col">
      <PdfViewer
        id={doc.id}
        title={doc.title}
        src={`/api/documents/${doc.id}/file`}
        downloadHref={`/api/documents/${doc.id}/file?download=1`}
        explicitPage={Number.isInteger(page) && page > 0 ? page : null}
        lastPage={doc.lastPage}
        pageCount={doc.pageCount}
        moduleId={doc.moduleId}
        heading={
          <>
            <FileText className="size-4 shrink-0 text-danger" aria-hidden />
            <h1 className="min-w-0 truncate text-sm font-semibold" title={doc.title}>{doc.title}</h1>
            {doc.module && (
              <Link href={`/modules/${doc.module.id}?tab=documents`} className="min-w-0 shrink">
                <ModuleTag name={doc.module.name} color={doc.module.color} />
              </Link>
            )}
          </>
        }
        actions={
          <DocumentMenu
            doc={doc}
            redirectTo="/documents"
            trigger={
              <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Unterlage bearbeiten, zuordnen, löschen" aria-label="Unterlage verwalten">
                <Settings2 className="size-4" />
              </button>
            }
          />
        }
        info={
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="font-semibold">{doc.title}</p>
              {doc.module && <ModuleTag name={doc.module.name} color={doc.module.color} />}
              {!doc.module && doc.semester && <p className="text-muted-foreground">{doc.semester.name}</p>}
              <p className="text-xs break-all text-muted-foreground">{doc.originalName}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(doc.size)} · hochgeladen {fmtDate(doc.createdAt)}</p>
              {doc.lastOpenedAt && <p className="text-xs text-muted-foreground">Zuletzt gelesen {fmtDate(doc.lastOpenedAt)} · S. {doc.lastPage}{doc.pageCount ? ` / ${doc.pageCount}` : ""}</p>}
            </div>
            {doc.description && <p className="whitespace-pre-wrap">{doc.description}</p>}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Verknüpft mit</p>
              {links === 0 && <p className="text-xs text-muted-foreground">Noch nichts. Verlinke das PDF aus einer Sitzung – oder markiere Text und mach eine Karteikarte daraus.</p>}
              <div className="space-y-1">
                {doc.notes.map(({ note }) => (
                  <Link key={note.id} href={`/notes/${note.id}`} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-sidebar-accent"><NotebookPen className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{sessionLabel(note)}</span></Link>
                ))}
                {doc.flashcards.map(({ flashcard }) => (
                  <Link key={flashcard.id} href={`/flashcards/${flashcard.id}`} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-sidebar-accent"><Layers className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{flashcard.front}</span></Link>
                ))}
                {doc.calendarEvents.map((e) => (
                  <Link key={e.id} href={`/calendar?date=${fmtDate(e.start, "yyyy-MM-dd")}`} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-sidebar-accent"><CalendarDays className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{e.title} · {fmtDate(e.start)}</span></Link>
                ))}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
