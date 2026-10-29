import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Brain, Info, Layers, Timer } from "lucide-react";
import { requireUser } from "@/server/auth";
import { reviewActivity, studyOverview } from "@/server/queries/flashcards";
import { EXAM_TYPES, type ExamType } from "@/lib/constants";
import { fmtDate, fmtDaysUntil } from "@/lib/dates";
import { RATING_HINTS, RATING_LABELS, GRADES } from "@/lib/srs/scheduler";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LearnTabs } from "@/components/study/learn-tabs";
import { EmptyState, ModuleDot, PageHeader, Stat } from "@/components/ui/misc";
import { MasteryBar } from "@/components/study/mastery-bar";
import { ActivityHeatmap, ForecastChart } from "@/components/study/forecast-chart";

export const metadata: Metadata = { title: "Lernen" };

export default async function ReviewPage() {
  const user = await requireUser();
  const [overview, activity] = await Promise.all([studyOverview(user), reviewActivity(user.id, 84)]);
  const modules = overview.modules.filter((m) => m.mastery.total > 0);
  const startable = overview.dueTotal + overview.newAvailableToday;

  return (
    <>
      <LearnTabs active="review" />
      <PageHeader
        title="Lernen"
        description="Spaced Repetition mit FSRS: Karten kommen genau dann wieder, wenn du sie sonst vergessen würdest."
        actions={startable > 0 && <Link href="/review/session" className={buttonClass("primary", "lg")}><Brain className="size-4" /> {startable} Karten lernen</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><Stat label="Fällig" value={overview.dueTotal} hint={overview.overdueTotal ? <span className="text-danger">davon {overview.overdueTotal} überfällig</span> : "Wiederholungen heute"} /></Card>
        <Card className="p-4"><Stat label="Neue Karten heute" value={overview.newAvailableToday} hint={`${overview.newTotal} neue insgesamt · Limit ${user.dailyNewLimit}/Tag`} /></Card>
        <Card className="p-4"><Stat label="Heute wiederholt" value={activity.today.count} hint={`Serie: ${activity.streak} Tag${activity.streak === 1 ? "" : "e"}`} /></Card>
        <Card className="p-4">
          <Stat label="Gefestigt" value={`${Math.round(overview.mastery.progress * 100)} %`} hint={`${overview.mastery.total} aktive Karten`} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Module" description="Fällige Karten, Lernstand und gezieltes Lernen nach Thema" />
          <CardBody>
            {modules.length === 0 ? (
              <EmptyState icon={Layers} title="Noch keine Karteikarten" description="Erstelle Karten in einem Modul oder direkt aus den Zeilen deiner Sitzungen." action={<Link href="/flashcards" className={buttonClass("secondary", "sm")}>Zu den Karteikarten</Link>} />
            ) : (
              <ul className="divide-y">
                {modules.map((m) => (
                  <li key={m.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <ModuleDot color={m.color} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/modules/${m.id}`} className="font-medium hover:underline">{m.name}</Link>
                        <p className="text-xs text-muted-foreground">
                          {m.semester.name} · {m.mastery.total} Karten · {m.due} fällig{m.overdue ? ` (${m.overdue} überfällig)` : ""} · {m.newCount} neu
                          {m.examDate && m.examDate >= new Date() && <> · <span className="font-medium text-foreground">{m.examType ? EXAM_TYPES[m.examType as ExamType] : "Prüfung"} {fmtDaysUntil(m.examDate)}</span></>}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/review/session?module=${m.id}`} className={buttonClass(m.due > 0 ? "primary" : "secondary", "sm")}>
                          <Brain className="size-3.5" /> {m.due > 0 ? `${m.due} lernen` : "Lernen"}
                        </Link>
                        <Link href={`/review/session?module=${m.id}&mode=cram`} className={buttonClass("secondary", "sm")} title="Alle Karten des Moduls, schwächste zuerst">
                          <Timer className="size-3.5" /> Prüfung
                        </Link>
                      </div>
                    </div>
                    <MasteryBar counts={m.mastery.counts} total={m.mastery.total} className="mt-2 ml-5" />
                    {m.topics.length > 0 && (
                      <div className="mt-2 ml-5 flex flex-wrap gap-1.5">
                        {m.topics.map((t) => (
                          <Link key={t} href={`/review/session?module=${m.id}&topic=${encodeURIComponent(t)}&mode=cram`} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">{t}</Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Prognose" description="Fällige Wiederholungen, 14 Tage" />
            <CardBody><ForecastChart data={overview.forecast} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Aktivität" description={`Seit ${fmtDate(activity.buckets[0]!.date)}`} />
            <CardBody><ActivityHeatmap data={activity.buckets} /></CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><Info className="size-4" /> So bewertest du</span>} />
            <CardBody className="space-y-2 text-sm">
              {GRADES.map((g) => (
                <p key={g}><span className="font-medium">{g} · {RATING_LABELS[g]}</span> <span className="text-muted-foreground">– {RATING_HINTS[g]}</span></p>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">
                FSRS schätzt für jede Karte Stabilität und Schwierigkeit und plant die nächste Wiederholung, wenn die Abrufwahrscheinlichkeit auf {Math.round(user.requestRetention * 100)} % fällt. Überfällige Karten mit der geringsten Abrufwahrscheinlichkeit kommen zuerst; Module mit naher Prüfung werden bevorzugt. <Link href="/settings" className="text-primary hover:underline">Einstellungen <ArrowRight className="inline size-3" /></Link>
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
