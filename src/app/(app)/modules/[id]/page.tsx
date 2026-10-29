import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brain, CalendarClock, ClipboardCheck, FileText, Layers, ListChecks, MapPin, NotebookPen, Plus, Timer, User } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getModule } from "@/server/queries/structure";
import { flashcardTopics, listFlashcards } from "@/server/queries/flashcards";
import { EXAM_TYPES, moduleColor, type ExamType } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtDaysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkTabs } from "@/components/ui/tabs";
import { Markdown } from "@/components/markdown";
import { EventRow } from "@/components/calendar/event-row";
import { MasteryBar } from "@/components/study/mastery-bar";
import { ModuleMenu, NewNoteButton } from "@/components/structure/actions";
import { NoteList } from "@/components/notes/note-list";
import { FlashcardList, NewFlashcardButton } from "@/components/flashcards/flashcard-list";
import { DocumentList } from "@/components/documents/document-list";
import { Dropzone } from "@/components/forms/upload";
import { listExams } from "@/server/queries/exams";
import { ExamList } from "@/components/exams/exam-list";
import { ModuleSummaryNote } from "@/components/structure/module-summary-note";
import { ExamPrep, ProgressBar } from "@/components/structure/exam-prep";
import { taskProgress } from "@/lib/checklist";

type Tab = "overview" | "sessions" | "exam" | "summary" | "cards" | "exams" | "documents";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const m = await getModule(user, (await params).id);
  return { title: m?.name ?? "Modul" };
}

export default async function ModulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (["overview", "sessions", "exam", "summary", "cards", "exams", "documents"] as const).includes(rawTab as Tab) ? (rawTab as Tab) : "overview";
  const mod = await getModule(user, id);
  if (!mod) notFound();

  const color = moduleColor(mod.color);
  const base = `/modules/${mod.id}`;
  const examUpcoming = mod.examDate && mod.examDate >= new Date(new Date().setHours(0, 0, 0, 0));
  const topics = taskProgress(mod.examTopics);

  return (
    <>
      <PageHeader
        breadcrumbs={<><Link href="/semesters" className="hover:text-foreground">Semester</Link> / <Link href={`/semesters/${mod.semester.id}`} className="hover:text-foreground">{mod.semester.name}</Link></>}
        title={<span className="inline-flex items-center gap-2.5"><span className={cn("size-3 rounded-full", color.dot)} aria-hidden />{mod.name}</span>}
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {mod.code && <span>{mod.code}</span>}
            {mod.ects != null && <span>{mod.ects} ECTS</span>}
            {mod.lecturer && <span className="inline-flex items-center gap-1"><User className="size-3.5" />{mod.lecturer}</span>}
            {mod.room && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{mod.room}</span>}
            {mod.examDate && (
              <span className={cn("inline-flex items-center gap-1", examUpcoming && "font-medium text-foreground")}>
                <CalendarClock className="size-3.5" />Prüfung {fmtDate(mod.examDate)}{examUpcoming && ` (${fmtDaysUntil(mod.examDate)})`}
              </span>
            )}
          </span>
        }
        actions={<ModuleMenu module={mod} />}
      />

      <LinkTabs
        className="mb-6"
        active={tab}
        tabs={[
          { key: "overview", label: "Übersicht", href: base },
          { key: "sessions", label: "Sitzungen", href: `${base}?tab=sessions`, count: mod.notes.length },
          { key: "exam", label: "Prüfung", href: `${base}?tab=exam`, count: topics.total ? `${topics.done}/${topics.total}` : undefined },
          { key: "summary", label: "Zusammenfassung", href: `${base}?tab=summary` },
          { key: "cards", label: "Karteikarten", href: `${base}?tab=cards`, count: mod.mastery.total },
          { key: "exams", label: "Probeklausuren", href: `${base}?tab=exams` },
          { key: "documents", label: "Unterlagen", href: `${base}?tab=documents`, count: mod.documents.length },
        ]}
      />

      {tab === "overview" && <Overview module={mod} />}
      {tab === "sessions" && (
        <section>
          <div className="mb-4 flex justify-end"><NewNoteButton moduleId={mod.id} /></div>
          {mod.notes.length === 0 ? (
            <EmptyState icon={NotebookPen} title="Noch keine Sitzungen" description="Eine Sitzung ist deine Cornell-Mitschrift für einen Vorlesungstag. Tipp: Vorlesungen im Kalender wöchentlich anlegen – die Sitzungen entstehen automatisch." action={<NewNoteButton moduleId={mod.id} />} />
          ) : (
            <NoteList notes={mod.notes} />
          )}
        </section>
      )}
      {tab === "exam" && (
        <ExamPrep
          key={mod.id}
          module={{
            id: mod.id,
            semesterId: mod.semesterId,
            name: mod.name,
            code: mod.code,
            lecturer: mod.lecturer,
            ects: mod.ects,
            color: mod.color,
            description: mod.description,
            room: mod.room,
            examGroupId: mod.examGroupId,
            examDate: mod.examDate,
            examType: mod.examType,
            examDuration: mod.examDuration,
            examLocation: mod.examLocation,
            examTopics: mod.examTopics,
            examNotes: mod.examNotes,
          }}
          partners={mod.examPartners}
          cardCount={mod.mastery.total}
        />
      )}
      {tab === "summary" && <ModuleSummaryNote key={mod.id} moduleId={mod.id} initial={mod.summaryNote} />}
      {tab === "cards" && <Cards moduleId={mod.id} />}
      {tab === "exams" && <Exams moduleId={mod.id} />}
      {tab === "documents" && (
        <div className="space-y-4">
          <Dropzone target={{ moduleId: mod.id }} compact />
          <DocumentList documents={mod.documents} empty="Noch keine Unterlagen in diesem Modul." />
        </div>
      )}
    </>
  );
}

type ModuleData = NonNullable<Awaited<ReturnType<typeof getModule>>>;

function Overview({ module: mod }: { module: ModuleData }) {
  const recent = mod.notes.slice(0, 5);
  const topics = taskProgress(mod.examTopics);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Lernstand" description={`${mod.mastery.total} Karteikarten · ${Math.round(mod.mastery.progress * 100)} % gefestigt`} />
          <CardBody>
            <MasteryBar counts={mod.mastery.counts} total={mod.mastery.total} legend />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/review/session?module=${mod.id}`} className={buttonClass(mod.dueCount > 0 ? "primary" : "secondary")}>
                <Brain className="size-4" /> {mod.dueCount > 0 ? `${mod.dueCount} fällige lernen` : "Fällige & neue lernen"}
              </Link>
              {mod.mastery.total > 0 && (
                <Link href={`/review/session?module=${mod.id}&mode=cram`} className={buttonClass("secondary")} title="Alle Karten, schwächste zuerst – ideal kurz vor der Prüfung">
                  <Timer className="size-4" /> Prüfungsvorbereitung
                </Link>
              )}
              <NewFlashcardButton moduleId={mod.id} topics={mod.topics} variant="secondary" />
            </div>
            {mod.topics.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Nach Thema lernen</p>
                <div className="flex flex-wrap gap-1.5">
                  {mod.topics.map((t) => (
                    <Link key={t} href={`/review/session?module=${mod.id}&topic=${encodeURIComponent(t)}&mode=cram`} className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted">{t}</Link>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {mod.description.trim() && (
          <Card>
            <CardHeader title="Beschreibung" />
            <CardBody><Markdown>{mod.description}</Markdown></CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Letzte Sitzungen" action={<NewNoteButton moduleId={mod.id} variant="secondary" size="sm" />} />
          <CardBody>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Sitzungen. Lege eine an oder erzeuge sie über wiederkehrende Vorlesungen im Kalender.</p>
            ) : (
              <NoteList notes={recent} />
            )}
            {mod.notes.length > recent.length && (
              <Link href={`/modules/${mod.id}?tab=sessions`} className="mt-3 inline-block text-sm font-medium hover:underline">Alle {mod.notes.length} Sitzungen →</Link>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title={mod.examPartners.length ? "Gemeinsame Prüfung" : "Prüfung"} />
          <CardBody className="space-y-3 text-sm">
            {mod.examPartners.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                zusammen mit
                {mod.examPartners.map((p) => (
                  <Link key={p.id} href={`/modules/${p.id}`} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-foreground hover:bg-muted">
                    <span className={cn("size-2 rounded-full", moduleColor(p.color).dot)} aria-hidden />{p.name}
                  </Link>
                ))}
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">Form</dt>
              <dd>{mod.examType ? EXAM_TYPES[mod.examType as ExamType] : "–"}</dd>
              <dt className="text-muted-foreground">Termin</dt>
              <dd>{mod.examDate ? fmtDateTime(mod.examDate) : "–"}</dd>
              <dt className="text-muted-foreground">Dauer</dt>
              <dd>{mod.examDuration ? `${mod.examDuration} Min.` : "–"}</dd>
              <dt className="text-muted-foreground">Ort</dt>
              <dd>{mod.examLocation ?? "–"}</dd>
            </dl>
            {mod.examTopics.trim() && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="font-medium">Prüfungsinhalte</p>
                  {topics.total > 0 && <span className="text-xs text-muted-foreground tabular-nums">{topics.done}/{topics.total} sicher</span>}
                </div>
                {topics.total > 0 && <ProgressBar done={topics.done} total={topics.total} className="mb-2" />}
                <Excerpt text={mod.examTopics} lines={8} />
              </div>
            )}
            {mod.examNotes.trim() && (
              <div className="rounded-lg bg-warning/12 p-3">
                <p className="mb-1 font-medium">Hinweise</p>
                <Excerpt text={mod.examNotes} lines={4} fade="from-[color-mix(in_oklab,var(--color-warning)_12%,var(--color-card))]" />
              </div>
            )}
            {!mod.examTopics.trim() && !mod.examNotes.trim() && !mod.examDate && (
              <p className="text-muted-foreground">Termin und Form über „Bearbeiten → Prüfung“, Inhalte und Hinweise im Tab „Prüfung“.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/modules/${mod.id}?tab=exam`} className={buttonClass("secondary", "sm")}>
                <ListChecks className="size-4" /> {mod.examTopics.trim() || mod.examNotes.trim() ? "Alles zur Prüfung" : "Inhalte sammeln"}
              </Link>
              <Link href={`/modules/${mod.id}?tab=exams`} className={buttonClass("secondary", "sm")}>
                <ClipboardCheck className="size-4" /> Probeklausuren
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Nächste Termine" action={<Link href="/calendar" className={buttonClass("ghost", "sm")}>Kalender</Link>} />
          <CardBody className="space-y-2">
            {mod.calendarEvents.length === 0 && <p className="text-sm text-muted-foreground">Keine anstehenden Termine.</p>}
            {mod.calendarEvents.map((e) => (
              <EventRow key={e.id} event={{ ...e, module: null, note: null, document: null }} showDate={(d) => fmtDate(d, "EEE dd.MM.")} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Neueste Unterlagen" action={<Link href={`/modules/${mod.id}?tab=documents`} className={buttonClass("ghost", "sm")}>Alle</Link>} />
          <CardBody className="space-y-1">
            {mod.documents.slice(0, 5).map((d) => (
              <Link key={d.id} href={`/documents/${d.id}`} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                <FileText className="size-4 shrink-0 text-danger" aria-hidden />
                <span className="truncate">{d.title}</span>
              </Link>
            ))}
            <Dropzone target={{ moduleId: mod.id }} compact className="pt-2" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

async function Cards({ moduleId }: { moduleId: string }) {
  const user = await requireUser();
  const [cards, topics] = await Promise.all([listFlashcards(user, { moduleId }), flashcardTopics(user.id, moduleId)]);
  return (
    <section>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Link href={`/flashcards?module=${moduleId}`} className={buttonClass("secondary")}>Filtern & durchsuchen</Link>
        <NewFlashcardButton moduleId={moduleId} topics={topics} />
      </div>
      {cards.length === 0 ? (
        <EmptyState icon={Layers} title="Noch keine Karteikarten" description="Erstelle Karten direkt oder erzeuge sie aus den Zeilen deiner Sitzungen." action={<NewFlashcardButton moduleId={moduleId} topics={topics} />} />
      ) : (
        <FlashcardList cards={cards} showModule={false} topics={topics} />
      )}
    </section>
  );
}

async function Exams({ moduleId }: { moduleId: string }) {
  const user = await requireUser();
  const exams = await listExams(user.id, moduleId);
  const newButton = <Link href={`/exams/new?module=${moduleId}`} className={buttonClass()}><Plus className="size-4" /> Probeklausur</Link>;
  return (
    <section>
      <div className="mb-4 flex justify-end">{exams.length > 0 && newButton}</div>
      {exams.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Noch keine Probeklausur" description="Lass dir aus deinen Mitschriften eine Klausur generieren und schreibe sie unter echten Bedingungen." action={newButton} />
      ) : (
        <ExamList exams={exams} showModule={false} />
      )}
    </section>
  );
}

/**
 * Long exam texts only as a preview on the overview: the first lines, faded
 * out – the full text (and editing) lives in the "Prüfung" tab.
 */
function Excerpt({ text, lines, fade = "from-card" }: { text: string; lines: number; fade?: string }) {
  const long = text.trim().split("\n").length > lines || text.length > lines * 70;
  if (!long) return <Markdown>{text}</Markdown>;
  return (
    <div className="relative overflow-hidden" style={{ maxHeight: `${lines * 1.65}em` }}>
      <Markdown>{text}</Markdown>
      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent", fade)} aria-hidden />
    </div>
  );
}
