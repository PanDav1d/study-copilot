import Link from "next/link";
import { ArrowRight, BookOpen, Brain, CheckCircle2, PenLine } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Badge, ModuleDot } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { StudyTaskToggle } from "@/components/calendar/study-task-toggle";
import { fmtDate } from "@/lib/dates";
import { sessionTitle } from "@/lib/labels";
import { SUMMARY_OVERDUE_DAYS } from "@/lib/gamification";
import type { OpenTasks } from "@/server/queries/tasks";
import { CreateSessionForEvent } from "./create-note-button";

function Row({ icon: Icon, children, action, href }: { icon: typeof PenLine; children: React.ReactNode; action?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </>
  );
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      {href ? (
        <Link href={href} className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 hover:underline">{body}</Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {action}
    </li>
  );
}

function Meta({ module, children }: { module: { name: string; color: string }; children?: React.ReactNode }) {
  return (
    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
      <ModuleDot color={module.color} className="size-1.5" /> {module.name}
      {children}
    </p>
  );
}

/** The dashboard inbox: missing summaries, sessions without notes, missed study sessions. */
export function TaskList({ tasks }: { tasks: OpenTasks }) {
  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2">Zu erledigen {tasks.total > 0 && <Badge>{tasks.total}</Badge>}</span>}
        description="Zusammenfassungen, Mitschriften und verpasste Lerneinheiten"
        action={tasks.summaryTotal > tasks.summaries.length && (
          <Link href="/notes?status=open" className={buttonClass("ghost", "sm")}>Alle <ArrowRight className="size-3.5" /></Link>
        )}
      />
      {tasks.total === 0 ? (
        <div className="flex items-center gap-3 px-5 pb-5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" /> Alles erledigt – jede Sitzung hat eine Mitschrift mit Zusammenfassung.
        </div>
      ) : (
        <ul className="divide-y border-t">
          {tasks.summaries.map((n) => (
            <Row
              key={n.id}
              icon={PenLine}
              href={`/notes/${n.id}?focus=summary`}
              action={
                n.daysOpen >= SUMMARY_OVERDUE_DAYS ? (
                  <Badge tone="warning">seit {n.daysOpen} Tagen</Badge>
                ) : (
                  <Badge>{n.daysOpen === 0 ? "heute" : "seit gestern"}</Badge>
                )
              }
            >
              <p className="truncate text-sm font-medium">{n.empty ? "Mitschrift ausfüllen" : "Zusammenfassung schreiben"}: {sessionTitle(n)}</p>
              <Meta module={n.module}><span>· {fmtDate(n.date, "EE dd.MM.")}</span></Meta>
            </Row>
          ))}
          {tasks.lectures.map((l) => (
            <Row key={l.id} icon={BookOpen} action={<CreateSessionForEvent event={l} moduleId={l.module.id} />}>
              <p className="truncate text-sm font-medium">Vorlesung ohne Mitschrift</p>
              <Meta module={l.module}><span>· {fmtDate(l.start, "EE dd.MM., HH:mm")}</span></Meta>
            </Row>
          ))}
          {tasks.studyTasks.map((e) => (
            <Row
              key={e.id}
              icon={Brain}
              href={e.module ? `/review/session?module=${e.module.id}${e.topic ? `&topic=${encodeURIComponent(e.topic)}&mode=cram` : ""}` : "/review/session"}
              action={<StudyTaskToggle id={e.id} completed={false} />}
            >
              <p className="truncate text-sm font-medium">Lerneinheit nachholen: {e.title}</p>
              {e.module ? <Meta module={e.module}><span>· geplant {fmtDate(e.start, "EE dd.MM.")}</span></Meta> : <p className="text-xs text-muted-foreground">geplant {fmtDate(e.start, "EE dd.MM.")}</p>}
            </Row>
          ))}
          {tasks.summaryTotal + tasks.lectureTotal > tasks.summaries.length + tasks.lectures.length && (
            <li className="px-5 py-2.5 text-xs text-muted-foreground">
              + {tasks.summaryTotal + tasks.lectureTotal - tasks.summaries.length - tasks.lectures.length} weitere ·{" "}
              <Link href="/notes?status=open" className="font-medium text-foreground hover:underline">alle offenen Zusammenfassungen</Link>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
