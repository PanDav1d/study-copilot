import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, NotebookPen } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getFlashcard } from "@/server/queries/flashcards";
import { fmtDate, fmtDateTime, fmtDaysUntil } from "@/lib/dates";
import { RATING_LABELS, STATE_LABELS, State, type Grade } from "@/lib/srs/scheduler";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ModuleTag, PageHeader, Stat } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { MasteryBadge } from "@/components/study/mastery-bar";

export const metadata: Metadata = { title: "Karteikarte" };

const RATING_TONES: Record<number, string> = {
  1: "bg-danger/12 text-danger",
  2: "bg-warning/20 text-amber-700 dark:text-warning",
  3: "bg-success/12 text-success",
  4: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
};

export default async function FlashcardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const card = await getFlashcard(user, (await params).id);
  if (!card) notFound();
  const correct = card.reviewLogs.filter((l) => l.rating > 1).length;

  return (
    <>
      <PageHeader
        breadcrumbs={<Link href={`/flashcards?module=${card.module.id}`} className="hover:text-foreground">Karteikarten</Link>}
        title="Karteikarte"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ModuleTag name={card.module.name} color={card.module.color} />
            {card.topic && <Badge>{card.topic}</Badge>}
            {card.suspended ? <Badge tone="warning">Pausiert</Badge> : <MasteryBadge level={card.level} />}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader title="Vorderseite" /><CardBody><Markdown>{card.front}</Markdown></CardBody></Card>
          <Card><CardHeader title="Rückseite" /><CardBody><Markdown>{card.back}</Markdown></CardBody></Card>
          {(card.note || card.documents.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {card.note && <Link href={`/notes/${card.note.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm hover:bg-muted"><NotebookPen className="size-3.5" />{card.note.title}</Link>}
              {card.documents.map(({ document: d }) => (
                <Link key={d.id} href={`/documents/${d.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm hover:bg-muted"><FileText className="size-3.5 text-danger" />{d.title}</Link>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Gedächtnismodell (FSRS)" />
            <CardBody className="grid grid-cols-2 gap-4">
              <Stat label="Status" value={<span className="text-base">{STATE_LABELS[card.state as State]}</span>} />
              <Stat label="Nächste Wiederholung" value={<span className="text-base">{card.state === State.New ? "–" : fmtDaysUntil(card.due)}</span>} hint={card.state === State.New ? undefined : fmtDate(card.due)} />
              <Stat label="Abrufwahrscheinlichkeit" value={card.state === State.New ? "–" : `${Math.round(card.retrievability * 100)} %`} hint="aktuell geschätzt" />
              <Stat label="Stabilität" value={card.state === State.New ? "–" : `${card.stability < 10 ? card.stability.toFixed(1).replace(".", ",") : Math.round(card.stability)} T`} hint="bis Abruf auf 90 % fällt" />
              <Stat label="Schwierigkeit" value={card.state === State.New ? "–" : `${card.difficulty.toFixed(1).replace(".", ",")} / 10`} />
              <Stat label="Trefferquote" value={card.reviewLogs.length ? `${Math.round((correct / card.reviewLogs.length) * 100)} %` : "–"} hint={`${card.reps} Wdh. · ${card.lapses}× vergessen`} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Wiederholungshistorie" description={`${card.reviewLogs.length} Einträge`} />
            <CardBody>
              {card.reviewLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch nicht wiederholt.</p>
              ) : (
                <ol className="space-y-1.5 text-sm">
                  {card.reviewLogs.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground tabular-nums">{fmtDateTime(l.review)}</span>
                      <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", RATING_TONES[l.rating])}>{RATING_LABELS[l.rating as Grade]}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
