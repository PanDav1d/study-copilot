import Link from "next/link";
import { differenceInCalendarDays, isToday } from "date-fns";
import { ArrowRight, Brain, CalendarDays, Flame, NotebookPen, Sparkles } from "lucide-react";
import { requireUser } from "@/server/auth";
import { upcomingEvents, upcomingExams } from "@/server/queries/calendar";
import { studyOverview } from "@/server/queries/flashcards";
import { gamificationState } from "@/server/gamification";
import { Ring } from "@/components/gamification/ring";
import { listNotes } from "@/server/queries/notes";
import { openTasks } from "@/server/queries/tasks";
import { db } from "@/lib/db";
import { EXAM_TYPES, type ExamType } from "@/lib/constants";
import { fmtDate, fmtRelative } from "@/lib/dates";
import { sessionTitle } from "@/lib/labels";
import { taskProgress } from "@/lib/checklist";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ModuleDot, Stat } from "@/components/ui/misc";
import { EventRow } from "@/components/calendar/event-row";
import { MasteryBar } from "@/components/study/mastery-bar";
import { ForecastChart } from "@/components/study/forecast-chart";
import { TaskList } from "@/components/dashboard/task-list";
import { StudyPlanButton } from "@/components/calendar/study-plan-dialog";
import { Onboarding } from "./onboarding";

export default async function DashboardPage() {
  const user = await requireUser();
  const semesterCount = await db.semester.count({ where: { userId: user.id } });
  if (semesterCount === 0) return <Onboarding name={user.name} />;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [overview, game, events, exams, tasks, notes] = await Promise.all([
    studyOverview(user),
    gamificationState(user.id),
    upcomingEvents(user.id, { from: startOfToday, days: 7, take: 30 }),
    upcomingExams(user.id, 4),
    openTasks(user.id),
    listNotes(user.id).then((n) => [...n].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 4)),
  ]);

  const today = events.filter((e) => isToday(e.start) || (e.start < startOfToday && e.end >= startOfToday));
  const later = events.filter((e) => !today.includes(e)).slice(0, 6);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";
  const reviewTotal = overview.dueTotal + overview.newAvailableToday;
  const modulesWithCards = overview.modules.filter((m) => m.mastery.total > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] text-muted-foreground">{fmtDate(new Date(), "EEEE, d. MMMM yyyy")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{greeting}, {user.name.split(" ")[0]}</h1>
        </div>
        {reviewTotal > 0 && (
          <Link href="/review/session" className={buttonClass("primary", "lg")}>
            <Brain className="size-4" /> {reviewTotal} Karten lernen <ArrowRight className="size-4" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/progress" className="rounded-xl border bg-card p-5 shadow-xs transition-colors hover:bg-accent/50">
          <div className="flex items-center gap-3">
            <Ring value={game.xpToday / game.dailyGoal} size={40} stroke={4} />
            <Stat label="Tagesziel" value={<span>{game.xpToday}<span className="text-sm font-normal text-muted-foreground">/{game.dailyGoal} XP</span></span>} />
          </div>
        </Link>
        <Link href="/progress" className="rounded-xl border bg-card p-5 shadow-xs transition-colors hover:bg-accent/50">
          <Stat
            label="Serie"
            value={<span className="inline-flex items-center gap-1.5">{game.streak}<Flame className={cn("size-5", game.activeToday ? "text-orange-500" : "text-muted-foreground")} aria-hidden /></span>}
            hint={game.activeToday ? "Heute gesichert" : game.streak > 0 ? <span className="text-amber-700 dark:text-warning">Heute noch offen</span> : "Starte heute"}
          />
        </Link>
        <Card className="p-5">
          <Stat
            label="Fällige Karten"
            value={overview.dueTotal}
            hint={overview.overdueTotal > 0 ? <span className="text-danger">{overview.overdueTotal} überfällig</span> : `+ ${overview.newAvailableToday} neue heute`}
          />
        </Card>
        <Link href="/progress" className="rounded-xl border bg-card p-5 shadow-xs transition-colors hover:bg-accent/50">
          <Stat label={`Level ${game.level}`} value={<span className="text-xl">{game.title}</span>} hint={`${game.current}/${game.needed} XP`} />
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/10">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(game.progress * 100)}%` }} />
          </div>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TaskList tasks={tasks} />

          <Card>
            <CardHeader
              title="Termine"
              description={today.length ? `Heute ${today.length} Termin${today.length === 1 ? "" : "e"}` : "Heute keine Termine"}
              action={<Link href="/calendar" className={buttonClass("ghost", "sm")}>Kalender <ArrowRight className="size-3.5" /></Link>}
            />
            <CardBody className="space-y-2">
              {today.map((e) => <EventRow key={e.id} event={e} />)}
              {later.length > 0 && (
                <>
                  <p className="pt-3 pb-1 text-xs font-medium text-muted-foreground">Nächste 7 Tage</p>
                  {later.map((e) => <EventRow key={e.id} event={e} showDate={(d) => fmtDate(d, "EE dd.")} />)}
                </>
              )}
              {today.length === 0 && later.length === 0 && (
                <EmptyState
                  icon={CalendarDays}
                  title="Keine anstehenden Termine"
                  description="Trage Vorlesungen und eigene Lerneinheiten im Kalender ein."
                  action={<Link href="/calendar" className={buttonClass("secondary", "sm")}>Zum Kalender</Link>}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Lernstand nach Modul"
              description="Wie gut sitzen deine Karteikarten?"
              action={<Link href="/review" className={buttonClass("ghost", "sm")}>Lernbereich <ArrowRight className="size-3.5" /></Link>}
            />
            <CardBody>
              {modulesWithCards.length === 0 ? (
                <EmptyState icon={Sparkles} title="Noch keine Karteikarten" description="Jede Zeile einer Sitzung wird mit einem Klick zur Karteikarte." />
              ) : (
                <ul className="divide-y">
                  {modulesWithCards.map((m) => (
                    <li key={m.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/modules/${m.id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline">
                            <ModuleDot color={m.color} /> <span className="truncate">{m.name}</span>
                          </Link>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{Math.round(m.mastery.progress * 100)} %</span>
                        </div>
                        <MasteryBar counts={m.mastery.counts} total={m.mastery.total} className="mt-2" />
                      </div>
                      {m.due + Math.min(m.newCount, overview.newAvailableToday) > 0 ? (
                        <Link href={`/review/session?module=${m.id}`} className={buttonClass("secondary", "sm", "w-24")}>
                          {m.due > 0 ? `${m.due} fällig` : "Neue lernen"}
                        </Link>
                      ) : (
                        <span className="w-24 text-center text-xs text-muted-foreground">Erledigt</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Prüfungen" action={<StudyPlanButton />} />
            <CardBody className="space-y-4">
              {exams.length === 0 && <p className="text-sm text-muted-foreground">Keine Prüfungstermine eingetragen. Hinterlege sie im jeweiligen Modul.</p>}
              {exams.map((m) => {
                const days = differenceInCalendarDays(m.examDate!, new Date());
                const stats = overview.modules.find((x) => x.id === m.id);
                const topics = taskProgress(m.examTopics);
                return (
                  <Link key={m.id} href={`/modules/${m.id}?tab=exam`} className="-m-1.5 flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-accent">
                    <div
                      className={cn(
                        "flex size-11 shrink-0 flex-col items-center justify-center rounded-lg border",
                        days <= 7 ? "border-danger/30 bg-danger/8 text-danger" : days <= 21 ? "border-warning/40 bg-warning/10 text-amber-700 dark:text-warning" : "bg-background",
                      )}
                    >
                      <span className="text-base leading-none font-semibold tabular-nums">{Math.max(0, days)}</span>
                      <span className="mt-0.5 text-[9px] font-medium uppercase">Tage</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.examType ? EXAM_TYPES[m.examType as ExamType] : "Prüfung"} · {fmtDate(m.examDate, "EE dd.MM., HH:mm")}
                        {topics.total > 0 && <> · <span className={cn(topics.done === topics.total && "text-success")}>{topics.done}/{topics.total} Themen</span></>}
                      </p>
                      {stats && stats.mastery.total > 0 && <MasteryBar counts={stats.mastery.counts} total={stats.mastery.total} className="mt-1.5" />}
                    </div>
                  </Link>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Wiederholungen" description="Fällige Karten der nächsten 14 Tage" />
            <CardBody><ForecastChart data={overview.forecast} /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Zuletzt bearbeitet" action={<Link href="/notes" className={buttonClass("ghost", "sm")}>Alle Sitzungen</Link>} />
            <CardBody className="space-y-0.5">
              {notes.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Sitzungen.</p>}
              {notes.map((n) => (
                <Link key={n.id} href={`/notes/${n.id}`} className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent">
                  <NotebookPen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{sessionTitle(n)}</p>
                    <p className="truncate text-xs text-muted-foreground">{n.module.name} · {fmtRelative(n.updatedAt)}</p>
                  </div>
                </Link>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
